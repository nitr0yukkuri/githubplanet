import assert from 'node:assert/strict';
import test from 'node:test';
import { registerPublicContributionHistoryRoutes } from '../src/presentation/http/public-contribution-history-routes.js';

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        status(code) { this.statusCode = code; return this; },
        set(name, value) { this.headers[name] = value; return this; },
        json(body) { this.body = body; return this; }
    };
}

function createRoutes(service, systemApiKey = 'test-secret') {
    const routes = new Map();
    const app = {
        get(path, handler) { routes.set(`GET ${path}`, handler); },
        post(path, handler) { routes.set(`POST ${path}`, handler); }
    };
    registerPublicContributionHistoryRoutes(app, { service, systemApiKey });
    return routes;
}

test('returns saved public history from the public profile endpoint', async () => {
    const history = { calendarYears: [2025], dailyContributions: [], capturedAt: '2025-01-01T00:00:00.000Z' };
    const routes = createRoutes({ async getByUsername(username) {
        return { githubId: '42', username, status: 'ready', history };
    } });
    const res = createResponse();

    await routes.get('GET /api/planets/user/:username/public-history')({ params: { username: 'octocat' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'public, max-age=300, stale-while-revalidate=600');
    assert.deepEqual(res.body.history, history);
});

test('marks a new profile history as pending without blocking on GitHub', async () => {
    const routes = createRoutes({ async getByUsername() { return { status: 'pending', history: null }; } });
    const res = createResponse();

    await routes.get('GET /api/planets/user/:username/public-history')({ params: { username: 'new-user' } }, res);
    assert.equal(res.statusCode, 202);
});

test('protects the scheduled refresh endpoint with a timing-safe API-key check', async () => {
    let refreshes = 0;
    const routes = createRoutes({ async refreshNext() { refreshes += 1; return { status: 'refreshed' }; } });
    const handler = routes.get('POST /api/system/planet-history/refresh');
    const unauthorized = createResponse();
    await handler({ get() { return 'wrong'; } }, unauthorized);
    assert.equal(unauthorized.statusCode, 401);
    assert.equal(refreshes, 0);

    const accepted = createResponse();
    await handler({ get() { return 'test-secret'; } }, accepted);
    assert.equal(accepted.statusCode, 200);
    assert.equal(refreshes, 1);
});

test('does not expose a system key in the error response', async () => {
    const routes = createRoutes({ async refreshNext() { throw new Error('internal'); } });
    const res = createResponse();
    await routes.get('POST /api/system/planet-history/refresh')({ get() { return 'test-secret'; } }, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: 'Public history refresh failed' });
});
