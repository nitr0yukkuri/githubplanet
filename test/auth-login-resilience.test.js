import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerAuthRoutes } from '../src/presentation/http/auth-routes.js';
import { registerPlanetRoutes } from '../src/presentation/http/planet-routes.js';

function createRouteApp() {
    const handlers = new Map();
    return {
        handlers,
        get(paths, handler) {
            for (const path of Array.isArray(paths) ? paths : [paths]) handlers.set(`GET ${path}`, handler);
        },
        post(path, handler) {
            handlers.set(`POST ${path}`, handler);
        }
    };
}

function createResponse() {
    return {
        headers: {},
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        setHeader(name, value) {
            this.headers[name] = value;
        },
        json(body) {
            this.body = body;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        },
        redirect(location) {
            this.location = location;
            return this;
        }
    };
}

test('OAuth callback saves the authenticated session before requesting planet data', async () => {
    const app = createRouteApp();
    let saved = false;
    let planetUpdateCalled = false;
    registerAuthRoutes(app, {
        githubClient: {
            async exchangeCode() { return 'access-token'; },
            async getAuthenticatedUser() { return { id: 42, login: 'new-user' }; }
        },
        planetService: {
            async updateAndSavePlanetData() { planetUpdateCalled = true; throw new Error('GitHub unavailable'); }
        },
        clientId: 'client',
        callbackUrl: 'https://example.test/callback',
        logger: { error() {}, warn() {} }
    });

    const req = {
        query: { code: 'oauth-code', state: 'expected-state' },
        session: {
            code_verifier: 'verifier',
            oauth_state: 'expected-state',
            login_return_to: '/'
        }
    };
    req.session.save = (callback) => {
        saved = true;
        callback(null);
    };
    const res = createResponse();

    await app.handlers.get('GET /callback')(req, res);

    assert.equal(saved, true);
    assert.equal(planetUpdateCalled, false);
    assert.equal(req.session.github_token, 'access-token');
    assert.deepEqual(req.session.planetData, {
        user: { id: 42, login: 'new-user' },
        planetData: null
    });
    assert.equal(req.session.last_updated, 0);
    assert.equal(res.location, '/');
});

test('OAuth callback reports a session persistence failure instead of pretending login succeeded', async () => {
    const app = createRouteApp();
    registerAuthRoutes(app, {
        githubClient: {
            async exchangeCode() { return 'access-token'; },
            async getAuthenticatedUser() { return { id: 42, login: 'new-user' }; }
        },
        planetService: {},
        clientId: 'client',
        callbackUrl: 'https://example.test/callback',
        logger: { error() {}, warn() {} }
    });

    const req = {
        query: { code: 'oauth-code', state: 'expected-state' },
        session: {
            code_verifier: 'verifier',
            oauth_state: 'expected-state',
            login_return_to: '/'
        }
    };
    req.session.save = (callback) => callback(new Error('session store unavailable'));
    const res = createResponse();

    await app.handlers.get('GET /callback')(req, res);

    assert.equal(res.statusCode, 503);
    assert.equal(res.location, undefined);
    assert.match(res.body, /ログイン状態を保存できませんでした/);
});

test('an authenticated session with unavailable initial planet data gets 503, not 401', async () => {
    const app = createRouteApp();
    registerPlanetRoutes(app, {
        planetService: {
            async updateAndSavePlanetData() { throw new Error('GitHub unavailable'); }
        },
        cacheDuration: 60_000
    });

    const res = createResponse();
    await app.handlers.get('GET /api/me')({
        session: {
            github_token: 'access-token',
            last_updated: 0,
            planetData: { user: { id: 42, login: 'new-user' }, planetData: null }
        }
    }, res);

    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['Retry-After'], '5');
    assert.deepEqual(res.body, {
        error: 'Planet data is temporarily unavailable',
        authenticated: true
    });
});
