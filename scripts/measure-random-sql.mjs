import pg from 'pg';

const { Client } = pg;

const PLANET_COLUMNS = `
    github_id, username, planet_color, planet_size_factor, main_language, language_stats,
    total_commits, weekly_commits, planet_name, achievements, active_title
`;
const DEFAULT_SIZES = [145, 1_000, 10_000, 100_000];
const databaseUrl = process.env.RANDOM_PERF_DATABASE_URL;
const optimizedMode = process.env.RANDOM_PERF_OPTIMIZED_MODE || 'uniform-offset';
const smallTableThreshold = Number.parseInt(
    process.env.RANDOM_PERF_SMALL_TABLE_THRESHOLD || '256',
    10
);

function option(name, fallback) {
    const index = process.argv.indexOf(name);
    return index === -1 ? fallback : process.argv[index + 1];
}

function parseInteger(value, name, min = 0) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < min) {
        throw new Error(`${name} must be an integer greater than or equal to ${min}.`);
    }
    return parsed;
}

function parseSizes(value) {
    const sizes = value
        .split(',')
        .map((size) => parseInteger(size.trim(), 'Dataset size', 1));
    if (sizes.length === 0) throw new Error('At least one dataset size is required.');
    return [...new Set(sizes)];
}

if (!['uniform-offset', 'indexed', 'indexed-union', 'adaptive', 'auto'].includes(optimizedMode)) {
    throw new Error(
        'RANDOM_PERF_OPTIMIZED_MODE must be uniform-offset, indexed, indexed-union, adaptive, or auto.'
    );
}
if (!Number.isInteger(smallTableThreshold) || smallTableThreshold < 1) {
    throw new Error('RANDOM_PERF_SMALL_TABLE_THRESHOLD must be a positive integer.');
}

function assertSafeDatabaseUrl(value) {
    if (!value) {
        throw new Error(
            'RANDOM_PERF_DATABASE_URL must point to a disposable local PostgreSQL database.'
        );
    }

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error('RANDOM_PERF_DATABASE_URL is not a valid PostgreSQL URL.');
    }

    if (
        !['postgres:', 'postgresql:'].includes(parsed.protocol)
        || !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
    ) {
        throw new Error(
            'Safety check failed: RANDOM_PERF_DATABASE_URL must use localhost PostgreSQL.'
        );
    }
}

function percentile(sortedValues, ratio) {
    return sortedValues[Math.min(
        sortedValues.length - 1,
        Math.ceil(sortedValues.length * ratio) - 1
    )];
}

function summarize(values) {
    const sortedValues = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sortedValues.length === 0) return null;
    const total = sortedValues.reduce((sum, value) => sum + value, 0);
    return {
        min: sortedValues[0],
        median: percentile(sortedValues, 0.5),
        average: total / sortedValues.length,
        p95: percentile(sortedValues, 0.95),
        p99: percentile(sortedValues, 0.99),
        max: sortedValues[sortedValues.length - 1]
    };
}

function buildExclusion(excludeIds) {
    if (excludeIds.length === 0) return { sql: '', params: [] };
    const placeholders = excludeIds.map((_, index) => `$${index + 1}`).join(', ');
    return {
        sql: ` AND github_id NOT IN (${placeholders})`,
        params: excludeIds
    };
}

function buildLegacyQuery(excludeIds) {
    const exclusion = buildExclusion(excludeIds);
    return {
        sql: `
            SELECT ${PLANET_COLUMNS}
            FROM random_planets
            WHERE TRUE${exclusion.sql}
            ORDER BY RANDOM()
            LIMIT 1
        `,
        params: exclusion.params
    };
}

function buildUniformOffsetQuery(excludeIds, randomValue) {
    const exclusion = buildExclusion(excludeIds);
    const randomValuePlaceholder = `$${excludeIds.length + 1}`;
    return {
        sql: `
            SELECT ${PLANET_COLUMNS}
            FROM random_planets
            WHERE TRUE${exclusion.sql}
            ORDER BY random_key
            OFFSET (
                SELECT FLOOR(
                    ${randomValuePlaceholder}::double precision
                    * COUNT(*)::double precision
                )::bigint
                FROM random_planets
                WHERE TRUE${exclusion.sql}
            )
            LIMIT 1
        `,
        params: [...exclusion.params, randomValue]
    };
}

function buildIndexedQuery(excludeIds, operator, randomKey) {
    const exclusion = buildExclusion(excludeIds);
    const randomKeyPlaceholder = `$${excludeIds.length + 1}`;
    return {
        sql: `
            SELECT ${PLANET_COLUMNS}
            FROM random_planets
            WHERE random_key ${operator} ${randomKeyPlaceholder}${exclusion.sql}
            ORDER BY random_key
            LIMIT 1
        `,
        params: [...exclusion.params, randomKey]
    };
}

function buildIndexedUnionQuery(excludeIds, randomKey) {
    const exclusion = buildExclusion(excludeIds);
    const randomKeyPlaceholder = `$${excludeIds.length + 1}`;
    return {
        sql: `
            SELECT ${PLANET_COLUMNS}
            FROM (
                (
                    SELECT ${PLANET_COLUMNS}, random_key, 0 AS random_bucket
                    FROM random_planets
                    WHERE random_key >= ${randomKeyPlaceholder}${exclusion.sql}
                    ORDER BY random_key
                    LIMIT 1
                )
                UNION ALL
                (
                    SELECT ${PLANET_COLUMNS}, random_key, 1 AS random_bucket
                    FROM random_planets
                    WHERE random_key < ${randomKeyPlaceholder}${exclusion.sql}
                    ORDER BY random_key
                    LIMIT 1
                )
            ) AS candidates
            ORDER BY random_bucket, random_key
            LIMIT 1
        `,
        params: [...exclusion.params, randomKey]
    };
}

function buildAdaptiveQuery(excludeIds, randomKey, smallTableThreshold = 1_000) {
    const exclusion = buildExclusion(excludeIds);
    const randomKeyPlaceholder = `$${excludeIds.length + 1}`;
    return {
        sql: `
            WITH stats AS MATERIALIZED (
                SELECT reltuples AS estimated_rows
                FROM pg_class
                WHERE oid = 'random_planets'::regclass
            ), candidates AS (
                (
                    SELECT ${PLANET_COLUMNS}, random() AS random_sort_key, 0 AS selection_bucket
                    FROM random_planets, stats
                    WHERE stats.estimated_rows >= 0
                      AND stats.estimated_rows <= ${smallTableThreshold}${exclusion.sql}
                    ORDER BY random_sort_key
                    LIMIT 1
                )
                UNION ALL
                (
                    SELECT ${PLANET_COLUMNS}, random_key AS random_sort_key, 1 AS selection_bucket
                    FROM random_planets, stats
                    WHERE stats.estimated_rows > ${smallTableThreshold}
                      AND random_key >= ${randomKeyPlaceholder}${exclusion.sql}
                    ORDER BY random_key
                    LIMIT 1
                )
                UNION ALL
                (
                    SELECT ${PLANET_COLUMNS}, random_key AS random_sort_key, 2 AS selection_bucket
                    FROM random_planets, stats
                    WHERE stats.estimated_rows > ${smallTableThreshold}
                      AND random_key < ${randomKeyPlaceholder}${exclusion.sql}
                    ORDER BY random_key
                    LIMIT 1
                )
            )
            SELECT ${PLANET_COLUMNS}
            FROM candidates
            ORDER BY selection_bucket, random_sort_key
            LIMIT 1
        `,
        params: [...exclusion.params, randomKey]
    };
}

function buildOptimizedQueryForExplain(mode, size, excludeIds) {
    if (mode === 'uniform-offset' || (mode === 'auto' && size > smallTableThreshold)) {
        return buildUniformOffsetQuery(excludeIds, 0.5);
    }
    if (mode === 'auto') return buildLegacyQuery(excludeIds);
    if (mode === 'indexed-union') return buildIndexedUnionQuery(excludeIds, 0.5);
    if (mode === 'adaptive') return buildAdaptiveQuery(excludeIds, 0.5, smallTableThreshold);
    return buildIndexedQuery(excludeIds, '>=', 0.5);
}

function flattenPlan(node, result = []) {
    if (!node) return result;
    result.push({
        nodeType: node['Node Type'],
        relationName: node['Relation Name'] || null,
        indexName: node['Index Name'] || null,
        planRows: node['Plan Rows'] ?? null,
        actualRows: node['Actual Rows'] ?? null,
        actualLoops: node['Actual Loops'] ?? null,
        rowsRemovedByFilter: node['Rows Removed by Filter'] ?? null,
        sharedHitBlocks: node['Shared Hit Blocks'] ?? null,
        sharedReadBlocks: node['Shared Read Blocks'] ?? null
    });
    for (const child of node.Plans || []) flattenPlan(child, result);
    return result;
}

async function explain(client, query) {
    const result = await client.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`,
        query.params
    );
    const plan = result.rows[0]['QUERY PLAN'][0];
    return {
        planningTimeMs: plan['Planning Time'],
        executionTimeMs: plan['Execution Time'],
        scanNodes: flattenPlan(plan.Plan)
    };
}

function assertReturnedAllowed(row, excludeIds, mode, size) {
    if (!row || excludeIds.includes(Number(row.github_id))) {
        throw new Error(
            `${mode} returned an invalid row for ${size} rows and ${excludeIds.length} exclusions.`
        );
    }
}

async function measureLegacy(client, excludeIds) {
    const query = buildLegacyQuery(excludeIds);
    const startedAt = performance.now();
    const result = await client.query(query.sql, query.params);
    return {
        durationMs: performance.now() - startedAt,
        queryCount: 1,
        row: result.rows[0] || null
    };
}

async function measureUniformOffset(client, excludeIds) {
    const query = buildUniformOffsetQuery(excludeIds, Math.random());
    const startedAt = performance.now();
    const result = await client.query(query.sql, query.params);
    return {
        durationMs: performance.now() - startedAt,
        queryCount: 1,
        row: result.rows[0] || null
    };
}

async function measureIndexed(client, excludeIds) {
    const randomKey = Math.random();
    const firstQuery = buildIndexedQuery(excludeIds, '>=', randomKey);
    const startedAt = performance.now();
    let result = await client.query(firstQuery.sql, firstQuery.params);
    let queryCount = 1;

    if (!result.rows[0]) {
        const secondQuery = buildIndexedQuery(excludeIds, '<', randomKey);
        result = await client.query(secondQuery.sql, secondQuery.params);
        queryCount += 1;
    }

    return {
        durationMs: performance.now() - startedAt,
        queryCount,
        row: result.rows[0] || null
    };
}

async function measureIndexedUnion(client, excludeIds) {
    const query = buildIndexedUnionQuery(excludeIds, Math.random());
    const startedAt = performance.now();
    const result = await client.query(query.sql, query.params);
    return {
        durationMs: performance.now() - startedAt,
        queryCount: 1,
        row: result.rows[0] || null
    };
}

async function measureAdaptive(client, excludeIds) {
    const query = buildAdaptiveQuery(excludeIds, Math.random(), smallTableThreshold);
    const startedAt = performance.now();
    const result = await client.query(query.sql, query.params);
    return {
        durationMs: performance.now() - startedAt,
        queryCount: 1,
        row: result.rows[0] || null
    };
}

async function measureMode(client, mode, excludeIds, warmupCount, sampleCount, size) {
    const measure = mode === 'legacy'
        ? measureLegacy
        : mode === 'uniform-offset'
            ? measureUniformOffset
            : mode === 'indexed-union'
                ? measureIndexedUnion
                : mode === 'adaptive'
                    ? measureAdaptive
                    : mode === 'auto'
                        ? size <= smallTableThreshold ? measureLegacy : measureUniformOffset
                        : measureIndexed;
    for (let index = 0; index < warmupCount; index += 1) {
        const result = await measure(client, excludeIds);
        assertReturnedAllowed(result.row, excludeIds, mode, size);
    }

    const durations = [];
    let fallbackQueryCount = 0;
    for (let index = 0; index < sampleCount; index += 1) {
        const result = await measure(client, excludeIds);
        assertReturnedAllowed(result.row, excludeIds, mode, size);
        durations.push(result.durationMs);
        fallbackQueryCount += result.queryCount - 1;
    }

    return {
        samples: sampleCount,
        timingsMs: summarize(durations),
        queryCount: sampleCount + fallbackQueryCount,
        fallbackQueryCount
    };
}

function delta(optimized, legacy) {
    return Number.isFinite(optimized) && Number.isFinite(legacy)
        ? optimized - legacy
        : null;
}

function compare(legacy, optimized) {
    return {
        p50DeltaMs: delta(optimized.timingsMs?.median, legacy.timingsMs?.median),
        p95DeltaMs: delta(optimized.timingsMs?.p95, legacy.timingsMs?.p95),
        p99DeltaMs: delta(optimized.timingsMs?.p99, legacy.timingsMs?.p99)
    };
}

function describeOptimizedMode(mode) {
    if (mode === 'uniform-offset') {
        return 'uniform random ordinal lookup ordered by indexed random_key';
    }
    if (mode === 'indexed-union') {
        return 'random_key indexed dual-range lookup in one round trip';
    }
    if (mode === 'adaptive') return 'estimated row-count adaptive legacy/indexed lookup';
    if (mode === 'auto') {
        return `startup-count auto selection (legacy <= ${smallTableThreshold}, uniform offset above)`;
    }
    return 'random_key indexed range lookup with wraparound';
}

async function seed(client, size) {
    await client.query('TRUNCATE random_planets');
    await client.query(`
        INSERT INTO random_planets (
            github_id, username, planet_color, planet_size_factor, main_language,
            language_stats, total_commits, weekly_commits, last_updated, planet_name,
            achievements, unlocked_titles, active_title, random_key
        )
        SELECT
            id,
            'benchmark-' || id,
            '#000000',
            1.0,
            'benchmark',
            '{}'::jsonb,
            0,
            0,
            NOW(),
            'Benchmark Planet ' || id,
            '{}'::jsonb,
            '{}'::jsonb,
            '{}'::jsonb,
            random()
        FROM generate_series(1, $1::bigint) AS ids(id)
    `, [size]);
    await client.query('ANALYZE random_planets');
}

async function main() {
    assertSafeDatabaseUrl(databaseUrl);
    const sizes = parseSizes(
        option('--sizes', process.env.RANDOM_PERF_SIZES || DEFAULT_SIZES.join(','))
    );
    const warmupCount = parseInteger(
        option('--warmup', process.env.RANDOM_PERF_WARMUP || '20'),
        'Warmup count'
    );
    const sampleCount = parseInteger(
        option('--samples', process.env.RANDOM_PERF_SAMPLES || '100'),
        'Sample count',
        100
    );
    const client = new Client({ connectionString: databaseUrl });

    await client.connect();
    try {
        await client.query(`
            CREATE TEMP TABLE random_planets (
                github_id BIGINT PRIMARY KEY,
                username TEXT NOT NULL,
                planet_color TEXT,
                planet_size_factor REAL,
                main_language TEXT,
                language_stats JSONB,
                total_commits INTEGER,
                weekly_commits INTEGER,
                last_updated TIMESTAMP,
                planet_name TEXT,
                achievements JSONB,
                unlocked_titles JSONB,
                active_title JSONB,
                random_key DOUBLE PRECISION NOT NULL
            )
        `);
        await client.query(
            'CREATE INDEX random_planets_random_key_idx ON random_planets (random_key)'
        );

        const datasets = [];
        for (const size of sizes) {
            await seed(client, size);
            const cases = [];
            for (const excludeIds of [[], [1], [1, 2]]) {
                const legacyQuery = buildLegacyQuery(excludeIds);
                const optimizedQuery = buildOptimizedQueryForExplain(
                    optimizedMode,
                    size,
                    excludeIds
                );
                const rounds = [];

                for (const order of [['legacy', 'optimized'], ['optimized', 'legacy']]) {
                    const measured = {};
                    for (const mode of order) {
                        const measuredMode = mode === 'optimized' ? optimizedMode : mode;
                        measured[mode] = await measureMode(
                            client,
                            measuredMode,
                            excludeIds,
                            warmupCount,
                            sampleCount,
                            size
                        );
                    }
                    rounds.push({
                        order: order.join(' -> '),
                        legacy: measured.legacy,
                        optimized: measured.optimized,
                        comparison: compare(measured.legacy, measured.optimized)
                    });
                }

                cases.push({
                    exclusions: excludeIds,
                    rounds,
                    queryPlans: {
                        legacy: await explain(client, legacyQuery),
                        optimized: await explain(client, optimizedQuery)
                    }
                });
            }
            datasets.push({ size, cases });
        }

        const database = new URL(databaseUrl);
        console.log(JSON.stringify({
            databaseHost: database.hostname,
            databasePort: database.port || '5432',
            baseline: 'ORDER BY RANDOM() from the previous repository implementation',
            optimized: describeOptimizedMode(optimizedMode),
            warmup: warmupCount,
            samples: sampleCount,
            datasets
        }, null, 2));
    } finally {
        // TEMP TABLEは接続終了時に破棄し、同名の永続テーブルを誤って削除する余地をなくす。
        await client.end();
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    const code = error?.code ? ` (${error.code})` : '';
    console.error(`[Random SQL Performance] ${message}${code}`);
    process.exitCode = 1;
});
