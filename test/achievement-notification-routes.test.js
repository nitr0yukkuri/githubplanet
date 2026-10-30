import assert from 'node:assert/strict';
import test from 'node:test';
import { registerAuthRoutes } from '../src/presentation/http/auth-routes.js';
import { registerPlanetRoutes } from '../src/presentation/http/planet-routes.js';

function createRouteHarness() {
    const routes = new Map();
    return {
        routes,
        app: {
            get(paths, ...routeHandlers) {
                const handler = routeHandlers.at(-1);
                for (const path of Array.isArray(paths) ? paths : [paths]) {
                    routes.set(`GET ${path}`, handler);
                }
            },
            post(paths, handler) {
                for (const path of Array.isArray(paths) ? paths : [paths]) {
                    routes.set(`POST ${path}`, handler);
                }
            }
        }
    };
}

function createResponse() {
    return {
        body: undefined,
        redirectTarget: undefined,
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        set(name, value) {
            this.headers ||= {};
            this.headers[name] = value;
            return this;
        },
        redirect(target) {
            this.redirectTarget = target;
            return this;
        }
    };
}

test('stores login progress once after the first successful planet load', async () => {
    const { app, routes } = createRouteHarness();
    let planetUpdateCalls = 0;
    let progressCalls = 0;
    const planetService = {
        async updateAndSavePlanetData() {
            planetUpdateCalls += 1;
            return {
                mainLanguage: 'Go',
                achievements: { FIRST_PLANET: { id: 'FIRST_PLANET' } },
                observedTotalContributions: 128,
                isNewPlanet: false
            };
        },
        async recordLoginProgress(githubId, data) {
            progressCalls += 1;
            assert.equal(githubId, 1);
            assert.equal(data.observedTotalContributions, 128);
            return {
                contributionDelta: 28,
                newlyUnlockedAchievementIds: ['FIRST_PLANET']
            };
        }
    };
    registerAuthRoutes(app, {
        githubClient: {
            exchangeCode: async () => 'token',
            getAuthenticatedUser: async () => ({ id: 1, login: 'tester' })
        },
        planetService,
        clientId: 'client',
        callbackUrl: 'http://localhost/callback'
    });
    registerPlanetRoutes(app, { planetService, cacheDuration: 60_000 });

    const req = {
        query: { code: 'code', state: 'state' },
        session: { code_verifier: 'verifier', oauth_state: 'state', login_return_to: '/en' }
    };
    req.session.save = (callback) => callback(null);
    const res = createResponse();
    await routes.get('GET /callback')(req, res);

    assert.equal(planetUpdateCalls, 0);
    assert.equal(progressCalls, 0);
    assert.equal(req.session.planetData.planetData, null);
    const firstMeResponse = createResponse();
    await routes.get('GET /api/me')(req, firstMeResponse);
    assert.deepEqual(firstMeResponse.body.progressNotice, {
        contributionDelta: 28,
        newlyUnlockedAchievementIds: ['FIRST_PLANET']
    });
    assert.equal('observedTotalContributions' in req.session.planetData.planetData, false);
    assert.equal('isNewPlanet' in req.session.planetData.planetData, false);
    const secondMeResponse = createResponse();
    await routes.get('GET /api/me')(req, secondMeResponse);
    assert.equal(req.session.pendingProgressNotice, undefined);
    assert.equal(secondMeResponse.body.progressNotice.contributionDelta, 0);
    assert.equal(planetUpdateCalls, 1);
    assert.equal(progressCalls, 1);
    assert.equal(res.redirectTarget, '/en');
    assert.equal('oauth_state' in req.session, false);
});

test('rejects missing, mismatched, and replayed OAuth states before token exchange', async () => {
    const { app, routes } = createRouteHarness();
    let exchangeCalls = 0;
    registerAuthRoutes(app, {
        githubClient: {
            async exchangeCode() {
                exchangeCalls += 1;
                return 'token';
            },
            async getAuthenticatedUser() { return { id: 1, login: 'tester' }; }
        },
        planetService: {
            async updateAndSavePlanetData() { return {}; },
            async recordLoginProgress() { return {}; }
        },
        clientId: 'client',
        callbackUrl: 'http://localhost/callback'
    });

    const req = {
        query: { code: 'code', state: 'expected-state' },
        session: { code_verifier: 'verifier', oauth_state: 'expected-state' }
    };
    const firstResponse = createResponse();
    await routes.get('GET /callback')(req, firstResponse);
    assert.equal(firstResponse.redirectTarget, '/');
    assert.equal(exchangeCalls, 1);
    assert.equal('oauth_state' in req.session, false);

    const replayResponse = createResponse();
    await routes.get('GET /callback')(req, replayResponse);
    assert.equal(replayResponse.statusCode, 400);
    assert.equal(exchangeCalls, 1);

    for (const state of [undefined, 'invalid--state']) {
        const invalidRequest = {
            query: { code: 'code', ...(state ? { state } : {}) },
            session: { code_verifier: 'verifier', oauth_state: 'expected-state' }
        };
        const invalidResponse = createResponse();
        await routes.get('GET /callback')(invalidRequest, invalidResponse);
        assert.equal(invalidResponse.statusCode, 400);
        assert.equal(invalidRequest.session.oauth_state, 'expected-state');
    }
    assert.equal(exchangeCalls, 1);
});

test('stores the generated OAuth state in the session before redirecting', async () => {
    const { app, routes } = createRouteHarness();
    registerAuthRoutes(app, {
        githubClient: {},
        planetService: {},
        clientId: 'client',
        callbackUrl: 'https://githubplanet.dev/callback'
    });

    const req = {
        path: '/login',
        session: {
            save(callback) { callback(null); }
        }
    };
    const res = createResponse();
    await routes.get('GET /login')(req, res);

    const authorizationUrl = new URL(res.redirectTarget);
    assert.equal(authorizationUrl.searchParams.get('state'), req.session.oauth_state);
    assert.match(req.session.oauth_state, /^[a-f0-9]{32}$/);
    assert.equal(authorizationUrl.searchParams.get('redirect_uri'), 'https://githubplanet.dev/callback');
});

test('logs OAuth rejection diagnostics without callback or cookie values', async () => {
    const { app, routes } = createRouteHarness();
    const logs = [];
    registerAuthRoutes(app, {
        githubClient: {},
        planetService: {},
        clientId: 'client',
        callbackUrl: 'https://githubplanet.dev/callback',
        sessionCookieName: '__session',
        logger: {
            warn(message) { logs.push(message); },
            error(message) { logs.push(message); }
        }
    });

    const req = {
        query: { code: 'secret-code-value', state: 'secret-state-value' },
        headers: { cookie: '__session=secret-cookie-value' },
        session: {}
    };
    const res = createResponse();
    await routes.get('GET /callback')(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(JSON.parse(logs[0]), {
        event: 'oauth.callback.rejected',
        reason: 'missing_code_verifier',
        sessionCookiePresent: true,
        codeVerifierPresent: false,
        expectedStatePresent: false,
        suppliedStatePresent: true
    });
    assert.equal(logs.length, 1);
    assert.doesNotMatch(logs[0], /secret-code-value|secret-state-value|secret-cookie-value/);
});

test('reports a repeated state parameter as supplied while rejecting it', async () => {
    const { app, routes } = createRouteHarness();
    const logs = [];
    registerAuthRoutes(app, {
        githubClient: {},
        planetService: {},
        clientId: 'client',
        callbackUrl: 'https://githubplanet.dev/callback',
        sessionCookieName: '__session',
        logger: {
            warn(message) { logs.push(message); },
            error(message) { logs.push(message); }
        }
    });

    const req = {
        query: { code: 'secret-code-value', state: ['one', 'two'] },
        session: { code_verifier: 'verifier', oauth_state: 'expected-state' }
    };
    const res = createResponse();
    await routes.get('GET /callback')(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(JSON.parse(logs[0]), {
        event: 'oauth.callback.rejected',
        reason: 'state_mismatch',
        sessionCookiePresent: false,
        codeVerifierPresent: true,
        expectedStatePresent: true,
        suppliedStatePresent: true
    });
    assert.doesNotMatch(logs[0], /secret-code-value|one|two|expected-state/);
});

test('records session persistence failures without logging error messages', () => {
    const { app, routes } = createRouteHarness();
    const logs = [];
    registerAuthRoutes(app, {
        githubClient: {},
        planetService: {},
        clientId: 'client',
        callbackUrl: 'https://githubplanet.dev/callback',
        logger: {
            warn(message) { logs.push(message); },
            error(message) { logs.push(message); }
        }
    });

    const req = {
        path: '/login',
        session: {
            save(callback) {
                const error = new Error('connection string contains secret-password');
                error.code = '42P01';
                callback(error);
            }
        }
    };
    const res = createResponse();
    routes.get('GET /login')(req, res);

    assert.equal(res.redirectTarget, '/');
    assert.deepEqual(JSON.parse(logs[0]), {
        event: 'oauth.session.save_failed',
        errorName: 'Error',
        errorCode: '42P01'
    });
    assert.equal(logs.length, 1);
    assert.doesNotMatch(logs[0], /secret-password/);
});

test('records callback processing failures without exposing error messages', async () => {
    const { app, routes } = createRouteHarness();
    const logs = [];
    registerAuthRoutes(app, {
        githubClient: {
            async exchangeCode() { return 'access-token'; },
            async getAuthenticatedUser() {
                const error = new Error('database response included secret-token');
                error.code = 'ERR_DATABASE';
                throw error;
            }
        },
        planetService: {},
        clientId: 'client',
        callbackUrl: 'https://githubplanet.dev/callback',
        logger: {
            warn(message) { logs.push(message); },
            error(message) { logs.push(message); }
        }
    });

    const req = {
        query: { code: 'secret-code-value', state: 'expected-state' },
        session: {
            code_verifier: 'secret-verifier',
            oauth_state: 'expected-state',
            login_return_to: '/en'
        }
    };
    const res = createResponse();
    await routes.get('GET /callback')(req, res);

    assert.equal(res.redirectTarget, '/en');
    assert.deepEqual(JSON.parse(logs[0]), {
        event: 'oauth.callback.processing_failed',
        errorName: 'Error',
        errorCode: 'ERR_DATABASE'
    });
    assert.equal(logs.length, 1);
    assert.doesNotMatch(logs[0], /secret-code-value|secret-verifier|expected-state|secret-token/);
});

test('returns pending login progress once and consumes it', async () => {
    const { app, routes } = createRouteHarness();
    registerPlanetRoutes(app, {
        planetService: {},
        planetQueryService: undefined,
        cacheDuration: 60_000
    });

    const req = {
        session: {
            last_updated: Date.now(),
            pendingProgressNotice: {
                contributionDelta: 28,
                newlyUnlockedAchievementIds: ['FIRST_PLANET', 'FIRST_COMMIT']
            },
            planetData: {
                user: { id: 1, login: 'tester' },
                planetData: { totalCommits: 1, weeklyCommits: 1 }
            }
        }
    };

    const firstResponse = createResponse();
    await routes.get('GET /api/me')(req, firstResponse);
    assert.deepEqual(firstResponse.body.progressNotice, {
        contributionDelta: 28,
        newlyUnlockedAchievementIds: ['FIRST_PLANET', 'FIRST_COMMIT']
    });
    assert.equal('pendingProgressNotice' in req.session, false);

    const secondResponse = createResponse();
    await routes.get('GET /api/me')(req, secondResponse);
    assert.deepEqual(secondResponse.body.progressNotice, {
        contributionDelta: 0,
        newlyUnlockedAchievementIds: []
    });
});

test('returns language history only for the authenticated account', async () => {
    const { app, routes } = createRouteHarness();
    const requestedIds = [];
    registerPlanetRoutes(app, {
        planetService: {},
        planetQueryService: {
            async getLanguageHistoryByGithubId(githubId) {
                requestedIds.push(githubId);
                return [{
                    capturedAt: '2025-01-01T00:00:00.000Z',
                    mainLanguage: 'JavaScript',
                    planetColor: '#f1e05a',
                    languagePercentages: { JavaScript: 100 }
                }];
            }
        },
        cacheDuration: 60_000
    });

    const unauthorizedResponse = createResponse();
    await routes.get('GET /api/me/language-history')({ session: {} }, unauthorizedResponse);
    assert.equal(unauthorizedResponse.statusCode, 401);
    assert.deepEqual(requestedIds, []);

    const response = createResponse();
    await routes.get('GET /api/me/language-history')({
        session: { planetData: { user: { id: 42 } } }
    }, response);
    assert.deepEqual(response.body, {
        history: [{
            capturedAt: '2025-01-01T00:00:00.000Z',
            mainLanguage: 'JavaScript',
            planetColor: '#f1e05a',
            languagePercentages: { JavaScript: 100 }
        }]
    });
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.deepEqual(requestedIds, [42]);
});
