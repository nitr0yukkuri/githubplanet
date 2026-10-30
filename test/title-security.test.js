import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlanetQueryService } from '../src/application/planet-query-service.js';
import { registerPlanetRoutes } from '../src/presentation/http/planet-routes.js';

function createApp() {
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
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

function createTitleRoute(repository) {
    const app = createApp();
    const planetQueryService = createPlanetQueryService({
        repository,
        githubClient: {},
        planetService: {},
        cacheDuration: 60_000
    });
    registerPlanetRoutes(app, { planetService: {}, planetQueryService, cacheDuration: 60_000 });
    return app.handlers.get('POST /api/save-title');
}

test('rejects arbitrary title parts without updating the database or session', async () => {
    let updateCalls = 0;
    const handler = createTitleRoute({
        async updateActiveTitle() { updateCalls += 1; }
    });
    const session = {
        planetData: {
            user: { id: 42 },
            planetData: {
                unlockedTitles: { prefixes: ['名もなき'], suffixes: ['旅人'] },
                activeTitle: { prefix: '名もなき', suffix: '旅人' }
            }
        }
    };
    const response = createResponse();

    await handler({
        session,
        body: { prefix: '管理者', suffix: '全称号解放' }
    }, response);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'Invalid title' });
    assert.equal(updateCalls, 0);
    assert.deepEqual(session.planetData.planetData.activeTitle, { prefix: '名もなき', suffix: '旅人' });
});

test('allows a title only when both parts are unlocked for the authenticated user', async () => {
    const updates = [];
    const handler = createTitleRoute({
        async updateActiveTitle(githubId, title) { updates.push({ githubId, title }); }
    });
    const session = {
        planetData: {
            user: { id: 42 },
            planetData: {
                unlockedTitles: { prefixes: ['名もなき', '星間の'], suffixes: ['旅人', '交信者'] },
                activeTitle: { prefix: '名もなき', suffix: '旅人' }
            }
        }
    };
    const response = createResponse();

    await handler({
        session,
        body: { prefix: '星間の', suffix: '交信者' }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(updates, [{ githubId: 42, title: { prefix: '星間の', suffix: '交信者' } }]);
    assert.deepEqual(session.planetData.planetData.activeTitle, { prefix: '星間の', suffix: '交信者' });
});
