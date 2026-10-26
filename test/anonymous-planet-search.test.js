import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlanetQueryService } from '../src/application/planet-query-service.js';
import { createPlanetService } from '../src/application/planet-service.js';
import { createGithubClient } from '../src/infrastructure/external/github-client.js';
import { toPlanetResponse } from '../src/presentation/http/planet-response.js';
import { registerPlanetRoutes } from '../src/presentation/http/planet-routes.js';

test('builds an anonymous public preview from public repository metadata without an OAuth token', async () => {
    const requests = [];
    const githubClient = createGithubClient({
        axios: {
            async get(url, config) {
                requests.push({ url, config });
                return { data: [{
                    owner: { login: 'new-user' },
                    language: 'TypeScript',
                    size: 12,
                    stargazers_count: 3,
                    fork: false
                }] };
            }
        }
    });
    const planetService = createPlanetService({
        githubClient,
        geminiClient: { async resolveLanguageColor() { throw new Error('must not call Gemini'); } }
    });
    const repository = { async findByUsername() { return null; } };
    const queryService = createPlanetQueryService({
        repository,
        githubClient,
        planetService,
        cacheDuration: 60_000
    });

    const [first, concurrent] = await Promise.all([
        queryService.getByUsername('new-user'),
        queryService.getByUsername('NEW-USER')
    ]);
    const response = toPlanetResponse(first);

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://api.github.com/users/new-user/repos');
    assert.equal(requests[0].config.timeout, 10_000);
    assert.equal(requests[0].config.headers.Authorization, undefined);
    assert.equal(concurrent, first);
    assert.equal(response.username, 'new-user');
    assert.equal(response.mainLanguage, 'TypeScript');
    assert.equal(response.totalCommits, 0);
    assert.equal(response.isPublicPreview, true);
});

test('caches missing public profiles briefly and rejects invalid usernames before GitHub calls', async () => {
    let calls = 0;
    const queryService = createPlanetQueryService({
        repository: { async findByUsername() { return null; } },
        githubClient: {},
        planetService: {
            async createPublicPreview() {
                calls += 1;
                const error = new Error('not found');
                error.response = { status: 404 };
                throw error;
            }
        },
        cacheDuration: 60_000
    });

    assert.equal(await queryService.getByUsername('missing-user'), null);
    assert.equal(await queryService.getByUsername('MISSING-USER'), null);
    assert.equal(await queryService.getByUsername('invalid/name'), null);
    assert.equal(calls, 1);
});

test('returns GitHub public API rate limits as 429 with a retry delay', async () => {
    const handlers = new Map();
    const app = {
        get(paths, handler) {
            for (const path of Array.isArray(paths) ? paths : [paths]) handlers.set(path, handler);
        },
        post() {}
    };
    registerPlanetRoutes(app, {
        planetService: {},
        planetQueryService: {
            async getByUsername() {
                const error = new Error('rate limited');
                error.response = { status: 403 };
                error.retryAfterMs = 2_000;
                throw error;
            }
        },
        cacheDuration: 60_000
    });
    const response = {
        headers: {},
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };

    await handlers.get('/api/planets/user/:username')({
        params: { username: 'some-user' },
        session: {}
    }, response);

    assert.equal(response.statusCode, 429);
    assert.equal(response.headers['Retry-After'], '2');
    assert.deepEqual(response.body, { error: 'GitHub public API rate limit reached' });
});

test('returns the 0x3EF8 cached planet without exposing its unverified profile URL', async () => {
    const handlers = new Map();
    const app = {
        get(paths, handler) {
            for (const path of Array.isArray(paths) ? paths : [paths]) handlers.set(path, handler);
        },
        post() {}
    };
    const storedPlanet = { githubId: 76643867, username: '0x3EF8', lastUpdated: null };
    const notFound = () => Object.assign(new Error('Not Found'), { response: { status: 404 } });
    const githubClient = {
        async getUser() { throw notFound(); },
        async getUserById() { throw notFound(); }
    };
    const planetQueryService = createPlanetQueryService({
        repository: {
            async findByUsername() { return storedPlanet; },
            async updateUsernameByGithubId() {},
            async reserveGithubProfileLookup() { return { allowed: true, retryAfterMs: 0 }; }
        },
        githubClient,
        planetService: {},
        cacheDuration: 60_000
    });
    registerPlanetRoutes(app, {
        planetService: {},
        planetQueryService,
        cacheDuration: 60_000
    });
    const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        send(body) { this.body = body; return this; },
        redirect(status, url) { this.statusCode = status; this.redirectUrl = url; return this; }
    };

    await handlers.get('/api/planets/user/:username')({
        params: { username: '0x3EF8' },
        session: {}
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.username, '0x3EF8');
    assert.equal(response.body.githubProfileVerified, false);

    const profileResponse = { ...response, statusCode: 200 };
    await handlers.get('/github-profile/:githubId')({ params: { githubId: '76643867' } }, profileResponse);
    assert.equal(profileResponse.statusCode, 410);
    assert.match(profileResponse.body, /no longer publicly available/i);
});

test('redirects profile links through the immutable ID and reports unavailable profiles', async () => {
    const handlers = new Map();
    const app = {
        get(paths, handler) {
            for (const path of Array.isArray(paths) ? paths : [paths]) handlers.set(path, handler);
        },
        post() {}
    };
    registerPlanetRoutes(app, {
        planetService: {},
        planetQueryService: {
            async getGithubProfileUrlById(id) {
                return id === '76643867' ? null : 'https://github.com/new-login';
            }
        },
        cacheDuration: 60_000
    });
    const createResponse = () => ({
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        send(body) { this.body = body; return this; },
        redirect(status, url) { this.statusCode = status; this.redirectUrl = url; return this; }
    });

    const renamedProfileResponse = createResponse();
    await handlers.get('/github-profile/:githubId')({ params: { githubId: '12345' } }, renamedProfileResponse);
    assert.equal(renamedProfileResponse.statusCode, 302);
    assert.equal(renamedProfileResponse.redirectUrl, 'https://github.com/new-login');

    const unavailableProfileResponse = createResponse();
    await handlers.get('/github-profile/:githubId')({ params: { githubId: '76643867' } }, unavailableProfileResponse);
    assert.equal(unavailableProfileResponse.statusCode, 410);
});

test('returns the retry delay when the anonymous profile lookup budget is exhausted', async () => {
    const handlers = new Map();
    const app = {
        get(paths, handler) {
            for (const path of Array.isArray(paths) ? paths : [paths]) handlers.set(path, handler);
        },
        post() {}
    };
    const rateLimited = Object.assign(new Error('lookup budget exhausted'), {
        response: { status: 429 },
        retryAfterMs: 12_000
    });
    registerPlanetRoutes(app, {
        planetService: {},
        planetQueryService: { async getGithubProfileUrlById() { throw rateLimited; } },
        cacheDuration: 60_000
    });
    const response = {
        headers: {},
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        send(body) { this.body = body; return this; }
    };

    await handlers.get('/github-profile/:githubId')({ params: { githubId: '12345' } }, response);

    assert.equal(response.statusCode, 429);
    assert.equal(response.headers['Retry-After'], '12');
});
