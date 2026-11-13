import assert from 'node:assert/strict';
import test from 'node:test';
import { issueSessionCsrfToken } from '../src/presentation/http/csrf-protection.js';
import { registerPlanetRoutes } from '../src/presentation/http/planet-routes.js';

function response() {
    return { statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; },
        status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function authenticatedSession() { return { planetData: { user: { id: 1, login: 'fixture' }, planetData: {} }, github_token: 'local-fixture-token' }; }

test('CSRF tokens are private, unpredictable per session, stable, and never issued anonymously', () => {
    const anonymous = {}, rejected = response();
    issueSessionCsrfToken({ session: anonymous }, rejected);
    assert.equal(rejected.statusCode, 401);
    assert.equal(anonymous.csrfToken, undefined);
    const a = authenticatedSession(), b = authenticatedSession();
    const first = response(), second = response(), repeated = response();
    issueSessionCsrfToken({ session: a }, first);
    issueSessionCsrfToken({ session: b }, second);
    issueSessionCsrfToken({ session: a }, repeated);
    assert.match(first.body.csrfToken, /^[a-f0-9]{64}$/);
    assert.notEqual(first.body.csrfToken, second.body.csrfToken);
    assert.equal(first.body.csrfToken, repeated.body.csrfToken);
    assert.equal(first.headers['Cache-Control'], 'private, no-store');
});

test('cookie-authenticated mutations reject missing, malformed and other-session tokens before I/O', async () => {
    const routes = new Map();
    const app = { get(path, ...handlers) { routes.set('GET ' + path, handlers.at(-1)); },
        post(path, ...handlers) { routes.set('POST ' + path, handlers.at(-1)); } };
    let writes = 0;
    registerPlanetRoutes(app, {
        planetQueryService: { async saveActiveTitle() { writes++; return true; } },
        authoredLanguageHistoryService: { async startScan() { writes++; }, async getHistory() { return {}; } }
    });
    const a = authenticatedSession(), b = authenticatedSession();
    issueSessionCsrfToken({ session: a }, response());
    issueSessionCsrfToken({ session: b }, response());
    for (const path of ['/api/save-title', '/api/me/authored-language-history/scan']) {
        for (const token of [undefined, '', 'a', '0'.repeat(64), b.csrfToken]) {
            const res = response();
            await routes.get('POST ' + path)({ session: a, headers: { 'x-csrf-token': token }, body: {} }, res);
            assert.equal(res.statusCode, 403, path);
            assert.deepEqual(res.body, { error: 'Invalid CSRF token' });
        }
    }
    assert.equal(writes, 0);
    const allowed = response();
    await routes.get('POST /api/save-title')({ session: a, headers: { 'x-csrf-token': a.csrfToken }, body: {} }, allowed);
    assert.equal(allowed.statusCode, 200);
    assert.equal(writes, 1);
});
