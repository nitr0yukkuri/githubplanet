import assert from 'node:assert/strict';
import test from 'node:test';
import { registerPlanetRoutes } from '../src/presentation/http/planet-routes.js';

const OFFICIAL_GITHUB_ID = '214794479';

function createRouteHarness(planetService) {
    const routes = new Map();
    const app = {
        get(paths, ...handlers) {
            for (const path of Array.isArray(paths) ? paths : [paths]) {
                routes.set(`GET ${path}`, handlers);
            }
        },
        post(paths, ...handlers) {
            for (const path of Array.isArray(paths) ? paths : [paths]) {
                routes.set(`POST ${path}`, handlers);
            }
        }
    };
    registerPlanetRoutes(app, { planetService, cacheDuration: 60_000 });
    return routes;
}

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: undefined,
        set(name, value) {
            this.headers[name.toLowerCase()] = value;
            return this;
        },
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

function createRequest(token) {
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    return {
        headers,
        get(name) { return headers[name.toLowerCase()]; }
    };
}

async function invokeRefresh(routes, token) {
    const handlers = routes.get('POST /api/planets/me/refresh');
    const response = createResponse();
    const request = createRequest(token);
    let authenticated = false;

    // Rate-limit middleware is covered by its shared express-rate-limit implementation.
    handlers[0](request, response, () => {});
    await handlers[2](request, response, () => { authenticated = true; });
    if (authenticated) await handlers[4](request, response);
    return response;
}

test('refresh route requires a bearer token and rejects a different GitHub user', async () => {
    let refreshCalls = 0;
    const routes = createRouteHarness({
        async refreshAuthenticatedUser(token) {
            return token === 'other-token'
                ? { id: '99', login: 'someone-else' }
                : { id: OFFICIAL_GITHUB_ID, login: 'nitr0yukkuri' };
        },
        async updateAndSavePlanetData() { refreshCalls++; }
    });

    const missingToken = await invokeRefresh(routes, undefined);
    assert.equal(missingToken.statusCode, 401);

    const otherUser = await invokeRefresh(routes, 'other-token');
    assert.equal(otherUser.statusCode, 403);
    assert.equal(refreshCalls, 0);
});

test('refresh route updates only the verified owner and returns the current login', async () => {
    const calls = [];
    const routes = createRouteHarness({
        async refreshAuthenticatedUser(token) {
            calls.push(['verify', token]);
            return { id: OFFICIAL_GITHUB_ID, login: 'renamed-owner' };
        },
        async updateAndSavePlanetData(user, token) {
            calls.push(['update', user.id, user.login, token]);
        }
    });

    const response = await invokeRefresh(routes, 'owner-token');
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.equal(response.body.username, 'renamed-owner');
    assert.ok(Number.isFinite(Date.parse(response.body.refreshedAt)));
    assert.deepEqual(calls, [
        ['verify', 'owner-token'],
        ['update', OFFICIAL_GITHUB_ID, 'renamed-owner', 'owner-token']
    ]);
});

test('refresh route fails without reporting success when planet persistence fails', async () => {
    const routes = createRouteHarness({
        async refreshAuthenticatedUser() {
            return { id: OFFICIAL_GITHUB_ID, login: 'nitr0yukkuri' };
        },
        async updateAndSavePlanetData() {
            throw new Error('database unavailable');
        }
    });

    const response = await invokeRefresh(routes, 'owner-token');
    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.body, { error: 'Planet data could not be refreshed' });
});
