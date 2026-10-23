import assert from 'node:assert/strict';
import test from 'node:test';
import { registerEventRoutes } from '../src/presentation/http/event-routes.js';

function createApp() {
    const handlers = new Map();
    return {
        handlers,
        get(path, handler) { handlers.set(`GET ${path}`, handler); },
        post(path, ...handlersForRoute) { handlers.set(`POST ${path}`, handlersForRoute.at(-1)); }
    };
}

function createResponse() {
    return {
        headers: {},
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { this.headers[name] = value; },
        json(body) { this.body = body; return this; }
    };
}

function createRoute(app, meteorEventRepository) {
    registerEventRoutes(app, {
        geminiClient: {},
        meteorService: {},
        meteorEventRepository,
        logger: { error() {} }
    });
    return app.handlers.get('GET /api/meteors');
}

test('returns replayable meteor events without requiring a user login', async () => {
    const calls = [];
    const app = createApp();
    const response = createResponse();
    const handler = createRoute(app, {
        async findAfter(afterId) {
            calls.push(afterId);
            return [{ id: '43', language: 'Elm' }];
        }
    });

    await handler({ query: { after: '42' } }, response);

    assert.deepEqual(calls, ['42']);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.deepEqual(response.body, { events: [{ id: '43', language: 'Elm' }] });
});

test('rejects malformed replay cursors and reports storage failures as retryable', async () => {
    let calls = 0;
    const handler = createRoute(createApp(), {
        async findAfter() {
            calls += 1;
            throw new Error('database offline');
        }
    });
    const invalidResponse = createResponse();
    const failureResponse = createResponse();

    await handler({ query: { after: '1; DROP TABLE meteor_events' } }, invalidResponse);
    await handler({ query: { after: '42' } }, failureResponse);

    assert.equal(invalidResponse.statusCode, 400);
    assert.equal(calls, 1);
    assert.equal(failureResponse.statusCode, 503);
    assert.deepEqual(failureResponse.body, { error: 'Meteor events are temporarily unavailable' });
});
