import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlanetQueryService } from '../src/application/planet-query-service.js';

function createHarness(rows = {}) {
    const calls = [];
    const repository = {
        async findByUsername(username) {
            calls.push(['findByUsername', username]);
            return rows[username] || null;
        },
        async findByGithubId(id) {
            calls.push(['findByGithubId', id]);
            return Object.values(rows).find((row) => row.github_id === id) || null;
        },
        async findRandom(excludeIds = []) {
            calls.push(['findRandom', excludeIds]);
            return Object.values(rows).find((row) => !excludeIds.includes(row.github_id)) || null;
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

test('keeps a stored user with no last_updated without refreshing it', async () => {
    const row = { github_id: 1, username: 'tester', last_updated: null };
    const { calls, service } = createHarness({ tester: row });

    assert.equal(await service.getByUsername('tester', 'token'), row);
    assert.deepEqual(calls, [['findByUsername', 'tester']]);
});

test('keeps the previous stale row when the post-refresh read is empty', async () => {
    const staleRow = { github_id: 1, username: 'tester', last_updated: '2000-01-01T00:00:00.000Z' };
    let reads = 0;
    const repository = {
        async findByUsername() {
            reads += 1;
            return reads === 1 ? staleRow : null;
        }
    };
    const service = createPlanetQueryService({
        repository,
        githubClient: { async getUser() { return { id: 1, login: 'tester' }; } },
        planetService: { async updateAndSavePlanetData() {} },
        cacheDuration: 60_000
    });

    assert.equal(await service.getByUsername('tester', 'token'), staleRow);
    assert.equal(reads, 2);
});

test('refreshes a random planet when last_updated is missing', async () => {
    const row = { github_id: 2, username: 'random', last_updated: null };
    const { calls, service } = createHarness({ random: row });

    assert.equal(await service.getRandom({ loggedInUserId: 1, accessToken: 'token' }), row);
    assert.deepEqual(calls, [
        ['findRandom', [1]],
        ['getUser', 'random'],
        ['updateAndSavePlanetData', 'random'],
        ['findByGithubId', 2]
    ]);
});

test('uses the same random fallback order and delegates title persistence', async () => {
    const { calls, service } = createHarness();

    assert.equal(await service.getRandom({ loggedInUserId: 1, lastRandomVisitedId: 2 }), null);
    await service.saveActiveTitle(1, { prefix: 'x', suffix: 'y' });

    assert.deepEqual(calls, [
        ['findRandom', [1, 2]],
        ['findRandom', [1]],
        ['findRandom', []],
        ['updateActiveTitle', 1, { prefix: 'x', suffix: 'y' }]
    ]);
});
