import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanetRepository } from '../src/infrastructure/database/planet-repository.js';

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
