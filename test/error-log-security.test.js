import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { inspect } from 'node:util';
import test from 'node:test';
import express from 'express';
import { AxiosError } from 'axios';
import { safeErrorMetadata } from '../src/shared/error-metadata.js';
import { createGithubClient } from '../src/infrastructure/external/github-client.js';
import { createGeminiClient } from '../src/infrastructure/external/gemini-client.js';
import { createPlanetQueryService } from '../src/application/planet-query-service.js';
import { createAuthoredLanguageHistoryService } from '../src/application/authored-language-history-service.js';
import { registerPlanetRoutes } from '../src/presentation/http/planet-routes.js';
import { registerEventRoutes } from '../src/presentation/http/event-routes.js';
import { createErrorHandler } from '../src/presentation/http/error-handler.js';
import { createRandomPerformanceReporter } from '../src/presentation/http/random-performance.js';
import { measureExternalOperation } from '../src/infrastructure/observability/external-performance.js';

const marker = 'SYNTHETICTOKENFORLOGREGRESSION';
function secretError(status = 503) {
    const error = new AxiosError(`Upstream URL?key=${marker}`, 'ECONNRESET', {
        url: `https://example.invalid/?key=${marker}`,
        headers: { Authorization: `Bearer ${marker}`, Cookie: marker, 'x-api-key': marker },
        data: { client_secret: marker, code: marker, code_verifier: marker }
    }, { cookie: marker }, { status, data: { access_token: marker }, headers: { 'set-cookie': marker } });
    error.cause = new Error(marker);
    return error;
}
function captureLogs(t) {
    const logs = [];
    for (const level of ['log', 'warn', 'error']) t.mock.method(console, level, (...args) => logs.push(inspect(args, { depth: 20 })));
    return logs;
}
function assertSafeLogs(logs) {
    assert.ok(logs.length > 0);
    assert.equal(logs.join('\n').includes(marker), false);
    assert.ok(logs.some((line) => line.includes('ECONNRESET')));
}
function routeHarness() {
    const routes = new Map();
    return { routes, app: {
        get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); },
        post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); }
    } };
}
function response() {
    return {
        statusCode: 200, headersSent: false,
        status(value) { this.statusCode = value; return this; },
        set() { return this; }, setHeader() {},
        json(value) { this.body = value; return this; },
        send(value) { this.headersSent = true; this.body = value; return this; }
    };
}

test('error metadata selects only known diagnostics without serializing the exception', () => {
    assert.deepEqual(safeErrorMetadata(secretError()), { errorName: 'AxiosError', errorCode: 'ECONNRESET', status: 503 });
    assert.deepEqual(safeErrorMetadata({ name: marker, code: marker, status: marker }), { errorName: 'Error', errorCode: 'unknown' });
    assert.deepEqual(safeErrorMetadata(null), { errorName: 'Error', errorCode: 'unknown' });
    const guarded = { name: 'Error', code: 'ETIMEDOUT', response: { status: 504 } };
    for (const key of ['message', 'stack', 'config', 'cause', 'toJSON', 'request']) {
        Object.defineProperty(guarded, key, { get() { assert.fail(`must not read ${key}`); } });
    }
    assert.deepEqual(safeErrorMetadata(guarded), { errorName: 'Error', errorCode: 'ETIMEDOUT', status: 504 });
    let reads = 0;
    assert.deepEqual(safeErrorMetadata({ get code() { return ++reads === 1 ? 'ECONNRESET' : marker; } }), {
        errorName: 'Error', errorCode: 'ECONNRESET'
    });
});

test('a real Axios failure in the named-search path never logs the token', async (t) => {
    const logs = captureLogs(t);
    const githubClient = createGithubClient({ axios: { async get() { throw secretError(); } } });
    const planetQueryService = createPlanetQueryService({
        repository: { async findByUsername() { return { githubId: 42, username: 'test-user' }; } },
        githubClient, planetService: {}, cacheDuration: 60_000
    });
    const { app, routes } = routeHarness();
    registerPlanetRoutes(app, { planetQueryService });
    const res = response();
    await routes.get('GET /api/planets/user/:username')({ params: { username: 'test-user' }, session: { github_token: marker } }, res);
    assert.equal(res.statusCode, 500);
    assertSafeLogs(logs);
});

for (const [route, status] of [
    ['GET /api/me', 200], ['POST /api/save-title', 500], ['GET /api/me/language-history', 500],
    ['GET /api/me/authored-language-history', 500], ['POST /api/me/authored-language-history/scan', 500],
    ['GET /api/planets/random', 500], ['GET /github-profile/:githubId', 502]
]) {
    test(`${route} error logs keep diagnostics and exclude request secrets`, async (t) => {
        const logs = captureLogs(t);
        const fail = async () => { throw secretError(); };
        const { app, routes } = routeHarness();
        registerPlanetRoutes(app, {
            planetService: { refreshAuthenticatedUser: fail },
            planetQueryService: {
                saveActiveTitle: fail, getRandom: fail, getLanguageHistoryByGithubId: fail,
                getGithubProfileUrlById: fail
            },
            authoredLanguageHistoryService: { getHistory: fail, startScan: fail }, cacheDuration: 60_000
        });
        const req = { params: { githubId: '42' }, body: { prefix: '名もなき', suffix: '旅人' }, session: {
            github_token: marker, last_updated: Date.now(),
            planetData: { user: { id: 42, login: 'test-user' }, planetData: { totalCommits: 321 } }
        } };
        const res = response();
        await routes.get(route)(req, res);
        assert.equal(res.statusCode, status);
        assertSafeLogs(logs);
    });
}

test('a failed rename sync keeps the verified profile URL without logging credentials', async (t) => {
    const logs = captureLogs(t);
    const service = createPlanetQueryService({
        repository: {
            async findByGithubId() { return { githubId: 42, username: 'old-user' }; },
            async updateUsernameByGithubId() { throw secretError(); }
        },
        githubClient: { async getUserById() { return { id: 42, login: 'new-user' }; } },
        planetService: {}, cacheDuration: 60_000
    });
    assert.equal(await service.getGithubProfileUrlById('42'), 'https://github.com/new-user');
    assertSafeLogs(logs);
});

for (const asyncWebhook of [false, true]) {
    test(`${asyncWebhook ? 'webhook' : 'manual meteor'} failures never log raw upstream errors`, async (t) => {
        const logs = captureLogs(t);
        const fail = async () => { throw secretError(); };
        const { app, routes } = routeHarness();
        registerEventRoutes(app, { meteorService: { emitManualMeteor: fail, processWebhook: fail } });
        const res = response();
        await routes.get(asyncWebhook ? 'POST /webhook' : 'POST /api/meteor')({ body: {} }, res);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(res.statusCode, 500);
        assertSafeLogs(logs);
    });
}

test('Gemini discovery and GraphQL response failures do not echo upstream secrets', async (t) => {
    const logs = captureLogs(t);
    const gemini = createGeminiClient({ apiKey: marker, languageColors: {}, axios: { async get() { throw secretError(); } } });
    assert.equal(await gemini.ask('name'), null);
    const github = createGithubClient({ axios: { async post() { return { data: { errors: [{ message: marker, extensions: { token: marker } }] } }; } } });
    await assert.rejects(github.getPlanetSource('test-user', marker), /GraphQL query failed/);
    assertSafeLogs(logs);
});

test('trace events exclude error messages and arbitrary error codes', async () => {
    const events = [];
    const error = secretError();
    error.code = marker;
    await assert.rejects(measureExternalOperation((value) => events.push(value), 'probe', async () => { throw error; }));
    assert.equal(events[0].errorCode, 503);
    const reporter = createRandomPerformanceReporter({ enabled: true, logger: (value) => events.push(value) });
    const req = { path: '/api/planets/random', session: { save(callback) { callback(secretError()); } } };
    const res = Object.assign(new EventEmitter(), { statusCode: 500 });
    reporter.middleware(req, res, () => {});
    req.session.save(() => {});
    res.emit('finish');
    assert.equal(inspect(events, { depth: 20 }).includes(marker), false);
});

test('scan failure diagnostics are safe both in logs and persisted error text', async (t) => {
    const logs = captureLogs(t);
    let stored;
    const service = createAuthoredLanguageHistoryService({ repository: {
        async getAuthoredLanguageHistoryScan() { return null; },
        async tryStartAuthoredLanguageHistoryScan() { return true; },
        async findAuthoredLanguageCommitKeys() { return []; },
        async failAuthoredLanguageHistoryScan(id, text) { stored = text; }
    }, githubClient: { async scanHistoricalAuthoredLanguageCommits() { throw secretError(); } } });
    await service.startScan({ githubId: 42, login: 'test-user', accessToken: marker, accountCreatedAt: '2020-01-01T00:00:00Z' });
    assert.deepEqual(JSON.parse(stored), { errorName: 'AxiosError', errorCode: 'ECONNRESET', status: 503 });
    assertSafeLogs(logs);
});

test('the HTTP fallback hides parser body and error messages while preserving status codes', async (t) => {
    const logs = captureLogs(t);
    const app = express();
    app.use(express.json());
    app.get('/failure', (_req, _res, next) => next(secretError()));
    app.use(createErrorHandler());
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}`;
    const upstream = await fetch(`${base}/failure`);
    assert.equal(upstream.status, 503);
    assert.equal(await upstream.text(), 'Service Unavailable');
    const malformed = await fetch(`${base}/anything`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: `{${marker}`
    });
    assert.equal(malformed.status, 400);
    assert.equal(await malformed.text(), 'Bad Request');
    assertSafeLogs(logs);
});

test('a failure after headers were sent closes the connection without forwarding the secret error', (t) => {
    const logs = captureLogs(t);
    let destroyed = false;
    createErrorHandler()(secretError(), {}, {
        headersSent: true,
        destroy() { destroyed = true; }
    }, () => assert.fail('must not forward the original error to Express logging'));
    assert.equal(destroyed, true);
    assertSafeLogs(logs);
});
