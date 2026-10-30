import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlanetQueryService } from '../src/application/planet-query-service.js';

test('returns a marked saved planet without an upstream call when the per-client quota is exhausted', async () => {
    const row = { githubId: 42, username: 'tester', mainLanguage: 'TypeScript',
        languageStats: { TypeScript: 100 }, totalCommits: 123 };
    const service = createPlanetQueryService({
        repository: { async findByUsername() { return row; } },
        anonymousLookupStore: { async reserveGithubProfileLookup() { return { allowed: false, retryAfterMs: 1000 }; } },
        githubClient: { async getUser() { assert.fail('quota refusal must happen before GitHub'); } },
        planetService: {}, cacheDuration: 60000
    });
    const result = await service.getByUsername('tester', undefined, 'a'.repeat(64));
    assert.equal(result.isStoredSnapshot, true);
    assert.equal(result.githubProfileVerified, false);
    assert.equal(result.totalCommits, 123);
    assert.deepEqual(result.languageStats, { TypeScript: 100 });
});

function createHarness(rows = {}) {
    const calls = [];
    const repository = {
        async findByUsername(username) {
            calls.push(['findByUsername', username]);
            return rows[username] || null;
        },
        async findByGithubId(id) {
            calls.push(['findByGithubId', id]);
            return Object.values(rows).find((row) => row.githubId === id) || null;
        },
        async findRandom(excludeIds = []) {
            calls.push(['findRandom', excludeIds]);
            return Object.values(rows).find((row) => !excludeIds.includes(row.githubId)) || null;
        },
        async updateUsernameByGithubId(id, username) {
            calls.push(['updateUsernameByGithubId', id, username]);
        },
        async updateActiveTitle(id, title) {
            calls.push(['updateActiveTitle', id, title]);
        }
    };
    const githubClient = {
        async getUser(username) {
            calls.push(['getUser', username]);
            return { id: 1, login: username };
        }
    };
    const planetService = {
        async updateAndSavePlanetData(user) {
            calls.push(['updateAndSavePlanetData', user.login]);
        }
    };

    return {
        calls,
        service: createPlanetQueryService({
            repository,
            githubClient,
            planetService,
            cacheDuration: 60_000
        })
    };
}

test('keeps saved planet data explicitly unverified during quota failure without updating it', async () => {
    const row = { githubId: 42, username: 'saved-owner', mainLanguage: 'TypeScript', totalCommits: 123,
        languageStats: { TypeScript: 80, CSS: 20 }, lastUpdated: '2025-01-01' };
    const service = createPlanetQueryService({ repository: {
        findByUsername: async () => row,
        updateUsernameByGithubId() { assert.fail('must not change ownership'); }
    }, githubClient: { async getUser() { throw Object.assign(new Error('cooldown'), { code: 'GITHUB_RATE_LIMITED' }); } },
    planetService: { updateAndSavePlanetData() { assert.fail('must not overwrite saved data'); } }, cacheDuration: 60000 });
    const result = await service.getByUsername('saved-owner');
    assert.deepEqual(result, { ...row, githubProfileVerified: false, isStoredSnapshot: true });
});

test('does not turn authentication errors into successful snapshots', async () => {
    const error = Object.assign(new Error('invalid token'), { response: { status: 401 } });
    const service = createPlanetQueryService({ repository: { findByUsername: async () => ({ githubId: 42, username: 'saved' }) },
        githubClient: { async getUser() { throw error; } }, planetService: {}, cacheDuration: 60000 });
    await assert.rejects(service.getByUsername('saved', 'expired-token'), (received) => received === error);
});

test('keeps a stored user with no last_updated without refreshing it', async () => {
    const row = { githubId: 1, username: 'tester', lastUpdated: null };
    const { calls, service } = createHarness({ tester: row });

    assert.equal(await service.getByUsername('tester', 'token'), row);
    assert.deepEqual(calls, [['findByUsername', 'tester'], ['getUser', 'tester']]);
});

test('keeps the previous stale row when the post-refresh read is empty', async () => {
    const staleRow = { githubId: 1, username: 'tester', lastUpdated: '2000-01-01T00:00:00.000Z' };
    let reads = 0;
    const repository = {
        async findByUsername() {
            reads += 1;
            return staleRow;
        },
        async findByGithubId() {
            return null;
        },
        async updateUsernameByGithubId() {}
    };
    const service = createPlanetQueryService({
        repository,
        githubClient: { async getUser() { return { id: 1, login: 'tester' }; } },
        planetService: { async updateAndSavePlanetData() {} },
        cacheDuration: 60_000
    });

    assert.equal(await service.getByUsername('tester', 'token'), staleRow);
    assert.equal(reads, 1);
});

test('returns a stored random planet without refreshing it', async () => {
    const row = { githubId: 2, username: 'random', lastUpdated: null };
    const { calls, service } = createHarness({ random: row });

    assert.equal(await service.getRandom({ loggedInUserId: 1, accessToken: 'token' }), row);
    assert.deepEqual(calls, [['findRandom', [1]]]);
});

test('uses the same random fallback order and delegates title persistence', async () => {
    const { calls, service } = createHarness();

    assert.equal(await service.getRandom({ loggedInUserId: 1, lastRandomVisitedId: 2 }), null);
    await service.saveActiveTitle(1, { prefix: 'x', suffix: 'y' }, {
        prefixes: ['x'],
        suffixes: ['y']
    });

    assert.deepEqual(calls, [
        ['findRandom', [1, 2]],
        ['findRandom', [1]],
        ['findRandom', []],
        ['updateActiveTitle', 1, { prefix: 'x', suffix: 'y' }]
    ]);
});

test('delegates language history reads to the repository by GitHub account id', async () => {
    const expected = [{
        capturedAt: '2025-01-01T00:00:00.000Z',
        mainLanguage: 'Rust',
        planetColor: '#dea584',
        languagePercentages: { Rust: 100 }
    }];
    const calls = [];
    const service = createPlanetQueryService({
        repository: {
            async findLanguageHistoryByGithubId(githubId) {
                calls.push(githubId);
                return expected;
            }
        },
        githubClient: {},
        planetService: {},
        cacheDuration: 60_000
    });

    assert.equal(await service.getLanguageHistoryByGithubId(42), expected);
    assert.deepEqual(calls, [42]);
});

test('does not return the previous owner planet after a username is claimed', async () => {
    const oldPlanet = { githubId: 1, username: 'claimed-name', lastUpdated: null };
    const preview = { username: 'claimed-name', isPublicPreview: true };
    const calls = [];
    const service = createPlanetQueryService({
        repository: {
            async findByUsername() { return oldPlanet; },
            async findByGithubId(id) {
                calls.push(['findByGithubId', id]);
                return null;
            },
            async updateUsernameByGithubId(...args) { calls.push(['updateUsernameByGithubId', ...args]); }
        },
        githubClient: {
            async getUser(username) {
                calls.push(['getUser', username]);
                return { id: 2, login: 'claimed-name' };
            }
        },
        planetService: { async createPublicPreview() { return preview; } },
        cacheDuration: 60_000
    });

    assert.equal(await service.getByUsername('claimed-name'), preview);
    assert.deepEqual(calls, [
        ['getUser', 'claimed-name'],
        ['findByGithubId', 2]
    ]);
});

test('resolves a renamed account by GitHub ID after the previous login returns 404', async () => {
    const storedPlanet = { githubId: 12345, username: 'old-login', lastUpdated: null };
    const calls = [];
    const notFound = () => Object.assign(new Error('Not Found'), { response: { status: 404 } });
    const service = createPlanetQueryService({
        repository: {
            async findByUsername(username) {
                calls.push(['findByUsername', username]);
                return storedPlanet;
            },
            async findByGithubId(id) {
                calls.push(['findByGithubId', id]);
                return storedPlanet;
            },
            async updateUsernameByGithubId(id, username) {
                calls.push(['updateUsernameByGithubId', id, username]);
            }
        },
        githubClient: {
            async getUser(username) {
                calls.push(['getUser', username]);
                throw notFound();
            },
            async getUserById(id) {
                calls.push(['getUserById', id]);
                return { id: Number(id), login: 'new-login' };
            }
        },
        planetService: {},
        cacheDuration: 60_000
    });

    assert.deepEqual(await service.getByUsername('old-login'), {
        ...storedPlanet,
        username: 'new-login'
    });
    assert.deepEqual(calls, [
        ['findByUsername', 'old-login'],
        ['getUser', 'old-login'],
        ['getUserById', '12345'],
        ['updateUsernameByGithubId', 12345, 'new-login']
    ]);
});

test('keeps the cached 0x3EF8 planet but marks its unavailable GitHub profile as unverified', async () => {
    const storedPlanet = { githubId: 76643867, username: '0x3EF8', lastUpdated: null };
    const calls = [];
    const notFound = () => Object.assign(new Error('Not Found'), { response: { status: 404 } });
    const service = createPlanetQueryService({
        repository: {
            async findByUsername(username) {
                calls.push(['findByUsername', username]);
                return storedPlanet;
            },
            async updateUsernameByGithubId() {}
        },
        githubClient: {
            async getUser(username) {
                calls.push(['getUser', username]);
                throw notFound();
            },
            async getUserById(id) {
                calls.push(['getUserById', id]);
                throw notFound();
            }
        },
        planetService: {},
        cacheDuration: 60_000
    });

    assert.deepEqual(await service.getByUsername('0x3EF8'), {
        ...storedPlanet,
        githubProfileVerified: false
    });
    assert.deepEqual(calls, [
        ['findByUsername', '0x3EF8'],
        ['getUser', '0x3EF8'],
        ['getUserById', '76643867']
    ]);
});

test('resolves the current GitHub profile URL from a saved stable ID', async () => {
    const calls = [];
    const service = createPlanetQueryService({
        repository: {
            async findByGithubId(id) {
                calls.push(['findByGithubId', id]);
                return { githubId: id, username: 'old-login' };
            },
            async updateUsernameByGithubId(id, username) {
                calls.push(['updateUsernameByGithubId', id, username]);
            }
        },
        githubClient: {
            async getUserById(id) {
                calls.push(['getUserById', id]);
                return { id: Number(id), login: 'new-login' };
            }
        },
        planetService: {},
        cacheDuration: 60_000
    });

    assert.equal(await service.getGithubProfileUrlById(12345), 'https://github.com/new-login');
    assert.deepEqual(calls, [
        ['findByGithubId', '12345'],
        ['getUserById', '12345'],
        ['updateUsernameByGithubId', '12345', 'new-login']
    ]);
});

test('does not turn a malformed GitHub login into an external redirect', async () => {
    const service = createPlanetQueryService({
        repository: {
            async findByGithubId() { return { githubId: 12345 }; }
        },
        githubClient: {
            async getUserById() { return { id: 12345, login: 'https://evil.example' }; }
        },
        planetService: {},
        cacheDuration: 60_000
    });

    assert.equal(await service.getGithubProfileUrlById(12345), null);
});

test('coalesces repeated GitHub identity checks for a stored username', async () => {
    let githubLookups = 0;
    const row = { githubId: 1, username: 'tester', lastUpdated: null };
    const service = createPlanetQueryService({
        repository: {
            async findByUsername() { return row; },
            async findByGithubId() { return null; },
            async updateUsernameByGithubId() {}
        },
        githubClient: {
            async getUser(username) {
                githubLookups += 1;
                await new Promise((resolve) => setTimeout(resolve, 5));
                return { id: 1, login: username };
            }
        },
        planetService: {},
        cacheDuration: 60_000
    });

    const [first, second] = await Promise.all([
        service.getByUsername('tester'),
        service.getByUsername('tester')
    ]);

    assert.equal(first, row);
    assert.equal(second, row);
    assert.equal(githubLookups, 1);
});
