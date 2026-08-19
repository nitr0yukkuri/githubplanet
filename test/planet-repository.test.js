import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanetRepository } from '../src/infrastructure/database/planet-repository.js';

test('finds a planet by username regardless of case', async () => {
    const calls = [];
    const repository = createPlanetRepository({
        async query(sql, params) {
            calls.push([sql, params]);
            if (sql.includes('ILIKE')) {
                return {
                    rows: [{ username: 'Alice' }]
                };
            }
            return { rows: [] };
        }
    });

    const row = await repository.findByUsername('ALICE');

    assert.deepEqual(row, { username: 'Alice' });
    assert.deepEqual(calls[0][1], ['ALICE']);
});

test('reports random query timing without changing random selection', async () => {
    const calls = [];
    const timings = [];
    const repository = createPlanetRepository({
        async query(sql, params) {
            calls.push([sql, params]);
            return { rows: [{ github_id: 3, username: 'random' }] };
        }
    }, {
        onRandomQueryTiming: (timing) => timings.push(timing)
    });

    const row = await repository.findRandom([1, 1, 2]);

    assert.deepEqual(row, { github_id: 3, username: 'random' });
    assert.deepEqual(calls[0][1], [1, 2]);
    assert.match(calls[0][0], /ORDER\s+BY\s+RANDOM\(\)/i);
    assert.equal(timings.length, 1);
    assert.equal(timings[0].exclusionCount, 2);
    assert.equal(timings[0].returnedRows, 1);
    assert.equal(timings[0].error, null);
    assert.equal(typeof timings[0].durationMs, 'number');
});

test('records and advances the owner login baseline in one transaction', async () => {
    const calls = [];
    const client = {
        async query(sql, params) {
            calls.push([sql.trim().split(/\s+/).slice(0, 2).join(' '), params]);
            if (sql.includes('SELECT last_login_contributions')) {
                return {
                    rows: [{
                        last_login_contributions: '100',
                        notified_achievement_ids: ['FIRST_PLANET']
                    }]
                };
            }
            return { rows: [] };
        },
        release() {
            calls.push(['RELEASE']);
        }
    };
    const repository = createPlanetRepository({ connect: async () => client });

    const result = await repository.recordLoginProgress(1, {
        currentContributions: 128,
        currentAchievementIds: ['FIRST_PLANET', 'COMMIT_100'],
        notifyCurrentAchievements: false
    });

    assert.deepEqual(result, {
        contributionDelta: 28,
        newlyUnlockedAchievementIds: ['COMMIT_100']
    });
    assert.deepEqual(calls.map(([operation]) => operation), [
        'BEGIN',
        'SELECT last_login_contributions,',
        'UPDATE planets',
        'COMMIT',
        'RELEASE'
    ]);
    assert.deepEqual(calls[2][1], [1, 128, '["FIRST_PLANET","COMMIT_100"]']);
});
