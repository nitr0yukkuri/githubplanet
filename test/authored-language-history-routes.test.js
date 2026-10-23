import assert from 'node:assert/strict';
import test from 'node:test';
import { registerPlanetRoutes } from '../src/presentation/http/planet-routes.js';

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        status(code) { this.statusCode = code; return this; },
        set(name, value) { this.headers[name] = value; return this; },
        json(body) { this.body = body; return this; }
    };
}

test('starts and reads authored-language history only for the logged-in account', async () => {
    const routes = new Map();
    const calls = [];
    const app = {
        get(path, handler) { routes.set(`GET ${path}`, handler); },
        post(path, handler) { routes.set(`POST ${path}`, handler); }
    };
    const authoredLanguageHistoryService = {
        async startScan(input) { calls.push(['start', input.githubId, input.login, input.accessToken]); return true; },
        async getHistory(id) { calls.push(['read', id]); return { history: [], status: { state: 'running' } }; }
    };
    registerPlanetRoutes(app, { authoredLanguageHistoryService });
    const handler = routes.get('GET /api/me/authored-language-history');
    const anonymous = createResponse();
    await handler({ session: {} }, anonymous);
    assert.equal(anonymous.statusCode, 401);
    assert.deepEqual(calls, []);

    const session = {
        planetData: { user: { id: 41, login: 'alice', created_at: '2020-01-01T00:00:00Z' } },
        github_token: 'private-token'
    };
    const response = createResponse();
    await handler({ session }, response);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(response.body.status.state, 'running');
    assert.deepEqual(calls, [['read', 41]]);

    const scanHandler = routes.get('POST /api/me/authored-language-history/scan');
    const scanResponse = createResponse();
    await scanHandler({ session }, scanResponse);

    assert.equal(scanResponse.headers['Cache-Control'], 'private, no-store');
    assert.equal(scanResponse.body.scanStarted, true);
    assert.deepEqual(calls, [['read', 41], ['start', 41, 'alice', 'private-token'], ['read', 41]]);
});
