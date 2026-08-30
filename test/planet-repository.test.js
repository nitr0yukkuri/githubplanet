import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanetRepository } from '../src/infrastructure/database/planet-repository.js';

function isStrategyCountQuery(sql) {
    return /^\s*SELECT COUNT\(\*\)::bigint AS count FROM planets\s*$/i.test(sql);
}

test('finds a planet by username regardless of case', async () => {
    const calls = [];
    const repository = createPlanetRepository({
        async query(sql, params) {
            calls.push([sql, params]);
            if (sql.includes('LOWER(username)')) {
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
    assert.match(calls[0][0], /LOWER\(username\)\s*=\s*LOWER\(\$1\)/i);
    assert.doesNotMatch(calls[0][0], /ILIKE/i);
    assert.match(calls[0][0], /last_updated/i);
    assert.doesNotMatch(calls[0][0], /SELECT\s+\*/i);
});

test('selects a random planet without sorting the whole table', async () => {
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
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][1].slice(0, 2), [1, 2]);
    assert.equal(typeof calls[0][1][2], 'number');
    assert.ok(calls[0][1][2] >= 0 && calls[0][1][2] < 1);
    assert.match(calls[0][0], /ORDER\s+BY\s+random_key/i);
    assert.equal(
        calls[0][0].match(/github_id\s+NOT\s+IN\s*\(\$1,\s*\$2\)/gi)?.length,
        2
    );
    assert.match(calls[0][0], /OFFSET\s*\(\s*SELECT\s+FLOOR/i);
    assert.match(calls[0][0], /\$3::double precision\s*\*\s*COUNT\(\*\)::double precision/i);
    assert.doesNotMatch(calls[0][0], /ORDER\s+BY\s+RANDOM\(\)/i);
    assert.doesNotMatch(calls[0][0], /random_key\s*(?:>=|<)/i);
    assert.equal(timings.length, 1);
    assert.equal(timings[0].exclusionCount, 2);
    assert.equal(timings[0].returnedRows, 1);
    assert.deepEqual(timings[0].poolBefore, {
        totalCount: null,
        idleCount: null,
        waitingCount: null
    });
    assert.deepEqual(timings[0].poolAfter, {
        totalCount: null,
        idleCount: null,
        waitingCount: null
    });
    assert.equal(timings[0].error, null);
    assert.equal(typeof timings[0].durationMs, 'number');
});

test('selects eligible ordinals uniformly regardless of random key gaps', async () => {
    const calls = [];
    const randomValues = [0, 0.34, 0.67, 0.51];
    const planets = [
        { github_id: 1, username: 'first', random_key: 0.1 },
        { github_id: 2, username: 'second', random_key: 0.11 },
        { github_id: 3, username: 'third', random_key: 0.9 }
    ];
    const repository = createPlanetRepository({
        async query(sql, params) {
            calls.push([sql, params]);
            const excludedIds = params.slice(0, -1);
            const randomValue = params.at(-1);
            const eligible = planets.filter(({ github_id }) => !excludedIds.includes(github_id));
            const selected = eligible[Math.floor(randomValue * eligible.length)];
            if (!selected) return { rows: [] };
            const { random_key, ...row } = selected;
            return { rows: [row] };
        }
    }, {
        random: () => randomValues.shift()
    });

    const rows = [
        await repository.findRandom(),
        await repository.findRandom(),
        await repository.findRandom(),
        await repository.findRandom([2])
    ];

    assert.deepEqual(rows.map(({ github_id }) => github_id), [1, 2, 3, 3]);
    assert.equal(calls.length, 4);
    assert.ok(calls.every(([sql]) => /OFFSET\s*\(/i.test(sql)));
    assert.equal(
        calls[3][0].match(/github_id\s+NOT\s+IN\s*\(\$1\)/gi)?.length,
        2
    );
    assert.deepEqual(calls[3][1], [2, 0.51]);
});

test('uses the legacy random scan for a small table after one startup count', async () => {
    const calls = [];
    const repository = createPlanetRepository({
        async query(sql, params) {
            calls.push([sql, params]);
            if (isStrategyCountQuery(sql)) return { rows: [{ count: '145' }] };
            return { rows: [{ github_id: 3, username: 'small-table' }] };
        }
    }, {
        randomQueryStrategy: 'auto',
        randomSmallTableThreshold: 256
    });

    await repository.initializeRandomQueryStrategy();
    const row = await repository.findRandom([1, 2]);
    await repository.findRandom([1, 2]);

    assert.equal(row.github_id, 3);
    assert.equal(calls.filter(([sql]) => sql.includes('COUNT(*)')).length, 1);
    assert.equal(calls.filter(([sql]) => /ORDER\s+BY\s+RANDOM\(\)/i.test(sql)).length, 2);
    assert.deepEqual(calls[1][1], [1, 2]);
});

test('keeps the indexed random scan for a large table in auto mode', async () => {
    const calls = [];
    const repository = createPlanetRepository({
        async query(sql, params) {
            calls.push([sql, params]);
            if (isStrategyCountQuery(sql)) return { rows: [{ count: '100000' }] };
            return { rows: [{ github_id: 3, username: 'large-table' }] };
        }
    }, { randomQueryStrategy: 'auto' });

    await repository.initializeRandomQueryStrategy();
    await repository.findRandom([1]);

    assert.match(calls[1][0], /ORDER\s+BY\s+random_key/i);
    assert.match(calls[1][0], /OFFSET\s*\(/i);
    assert.doesNotMatch(calls[1][0], /ORDER\s+BY\s+RANDOM\(\)/i);
});

test('refreshes the cached count in the background when the table grows', async () => {
    const calls = [];
    let countCalls = 0;
    let finishRefresh;
    const repository = createPlanetRepository({
        async query(sql, params) {
            calls.push([sql, params]);
            if (isStrategyCountQuery(sql)) {
                countCalls += 1;
                if (countCalls === 1) return { rows: [{ count: '145' }] };
                return new Promise((resolve) => {
                    finishRefresh = () => resolve({ rows: [{ count: '100000' }] });
                });
            }
            return { rows: [{ github_id: 3, username: 'still-fast' }] };
        }
    }, {
        randomQueryStrategy: 'auto',
        randomSmallTableThreshold: 256,
        randomCountRefreshMs: 1
    });

    await repository.initializeRandomQueryStrategy();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await repository.findRandom();
    const firstRandomQuery = calls.find(([sql]) => /ORDER\s+BY\s+RANDOM\(\)/i.test(sql));
    assert.ok(firstRandomQuery);

    finishRefresh();
    await new Promise((resolve) => setImmediate(resolve));
    await repository.findRandom();
    const indexedRandomQuery = calls.find(([sql]) => /ORDER\s+BY\s+random_key[\s\S]*OFFSET\s*\(/i.test(sql));
    assert.ok(indexedRandomQuery);
});

test('loads persisted language colors in one startup query', async () => {
    const calls = [];
    const repository = createPlanetRepository({
        async query(sql) {
            calls.push(sql);
            if (sql.includes('language_color_cache')) {
                return { rows: [
                    { language: 'NewLanguage', color: '#123456' },
                    { language: 'OtherLanguage', color: '#abcdef' }
                ] };
            }
            return { rows: [] };
        }
    });

    assert.deepEqual(await repository.loadLanguageColorCache(), {
        NewLanguage: '#123456',
        OtherLanguage: '#abcdef'
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0], /SELECT language, color FROM language_color_cache/i);
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
