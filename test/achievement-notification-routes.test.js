import assert from 'node:assert/strict';
import test from 'node:test';
import { registerAuthRoutes } from '../src/presentation/http/auth-routes.js';
import { registerPlanetRoutes } from '../src/presentation/http/planet-routes.js';

function createRouteHarness() {
    const routes = new Map();
    return {
        routes,
        app: {
            get(paths, handler) {
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
        json(body) {
            this.body = body;
            return this;
        },
        redirect(target) {
            this.redirectTarget = target;
            return this;
        }
    };
}

test('stores only newly unlocked achievement ids after a successful login', async () => {
    const { app, routes } = createRouteHarness();
    registerAuthRoutes(app, {
        githubClient: {
            exchangeCode: async () => 'token',
            getAuthenticatedUser: async () => ({ id: 1, login: 'tester' })
        },
        planetService: {
            updateAndSavePlanetData: async () => ({
                mainLanguage: 'Go',
                achievements: { FIRST_PLANET: { id: 'FIRST_PLANET' } },
                newlyUnlockedAchievementIds: ['FIRST_PLANET']
            })
        },
        clientId: 'client',
        callbackUrl: 'http://localhost/callback'
    });

    const req = {
        query: { code: 'code' },
        session: { code_verifier: 'verifier', login_return_to: '/en' }
    };
    const res = createResponse();
    await routes.get('GET /callback')(req, res);

    assert.deepEqual(req.session.pendingAchievementIds, ['FIRST_PLANET']);
    assert.equal('newlyUnlockedAchievementIds' in req.session.planetData.planetData, false);
    assert.equal(res.redirectTarget, '/en');
});

test('returns pending achievement ids once and consumes them', async () => {
    const { app, routes } = createRouteHarness();
    registerPlanetRoutes(app, {
        planetService: {},
        planetQueryService: undefined,
        cacheDuration: 60_000
    });

    const req = {
        session: {
            last_updated: Date.now(),
            pendingAchievementIds: ['FIRST_PLANET', 'FIRST_COMMIT'],
            planetData: {
                user: { id: 1, login: 'tester' },
                planetData: { totalCommits: 1, weeklyCommits: 1 }
            }
        }
    };

    const firstResponse = createResponse();
    await routes.get('GET /api/me')(req, firstResponse);
    assert.deepEqual(firstResponse.body.newlyUnlockedAchievementIds, ['FIRST_PLANET', 'FIRST_COMMIT']);
    assert.equal('pendingAchievementIds' in req.session, false);

    const secondResponse = createResponse();
    await routes.get('GET /api/me')(req, secondResponse);
    assert.deepEqual(secondResponse.body.newlyUnlockedAchievementIds, []);
});
