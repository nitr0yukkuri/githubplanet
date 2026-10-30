import { mapPlanetRow, RANDOM_PLANET_COLUMNS } from './planet-row.js';
import { safeErrorMetadata } from '../../shared/error-metadata.js';

const RANDOM_QUERY_STRATEGIES = new Set(['auto', 'indexed', 'legacy']);
const RANDOM_COUNT_REFRESH_MS = 5 * 60 * 1_000;

function snapshotPool(pool) {
    return {
        totalCount: Number.isInteger(pool.totalCount) ? pool.totalCount : null,
        idleCount: Number.isInteger(pool.idleCount) ? pool.idleCount : null,
        waitingCount: Number.isInteger(pool.waitingCount) ? pool.waitingCount : null
    };
}

export function createRandomPlanetReader(pool, {
    onRandomQueryTiming,
    randomQueryStrategy = 'auto',
    randomSmallTableThreshold = 256,
    randomCountRefreshMs = RANDOM_COUNT_REFRESH_MS,
    random = Math.random
} = {}) {
    if (!pool) return undefined;
    if (!RANDOM_QUERY_STRATEGIES.has(randomQueryStrategy)) {
        throw new Error(`Unsupported random query strategy: ${randomQueryStrategy}`);
    }
    if (!Number.isInteger(randomSmallTableThreshold) || randomSmallTableThreshold < 1) {
        throw new Error('randomSmallTableThreshold must be a positive integer');
    }
    if (!Number.isInteger(randomCountRefreshMs) || randomCountRefreshMs < 1) {
        throw new Error('randomCountRefreshMs must be a positive integer');
    }

    let initializedPlanetCount = null;
    let planetCountUpdatedAt = 0;
    let countRefreshPromise = null;

    async function readPlanetCount() {
        const result = await pool.query('SELECT COUNT(*)::bigint AS count FROM planets');
        return Number(result.rows[0]?.count || 0);
    }

    async function initializeRandomQueryStrategy() {
        if (randomQueryStrategy !== 'auto' || initializedPlanetCount !== null) return;
        initializedPlanetCount = await readPlanetCount();
        planetCountUpdatedAt = Date.now();
    }

    function refreshPlanetCountIfStale() {
        if (
            randomQueryStrategy !== 'auto'
            || initializedPlanetCount === null
            || Date.now() - planetCountUpdatedAt < randomCountRefreshMs
            || countRefreshPromise
        ) return;

        // 人数の変化で閾値を跨いでも、COUNT待ちでランダム表示を止めない。
        countRefreshPromise = readPlanetCount()
            .then((count) => {
                initializedPlanetCount = count;
                planetCountUpdatedAt = Date.now();
            })
            .catch((error) => {
                console.warn('[DB] ランダム検索用人数更新をスキップ:', safeErrorMetadata(error));
            })
            .finally(() => {
                countRefreshPromise = null;
            });
    }

    function useLegacyRandomQuery() {
        // 少数行では全表を一度走査する方が、毎回のインデックス往復・折り返し判定より短い。
        return randomQueryStrategy === 'legacy'
            || (randomQueryStrategy === 'auto'
                && initializedPlanetCount !== null
                && initializedPlanetCount <= randomSmallTableThreshold);
    }

    function buildExclusion(excludeIds) {
        if (excludeIds.length === 0) return '';
        return ` AND github_id NOT IN (${excludeIds.map((_, index) => `$${index + 1}`).join(', ')})`;
    }

    return {
        initializeRandomQueryStrategy,

        async findRandom(excludeIds = []) {
            const uniqueIds = [...new Set(excludeIds)];
            const startedAt = process.hrtime.bigint();
            const poolBefore = snapshotPool(pool);
            let result;
            let queryError;
            let queryCount = 0;
            let strategyUsed = 'unknown';
            try {
                refreshPlanetCountIfStale();
                const exclusion = buildExclusion(uniqueIds);
                if (useLegacyRandomQuery()) {
                    strategyUsed = 'legacy';
                    result = await pool.query(
                        `
                            SELECT ${RANDOM_PLANET_COLUMNS}
                            FROM planets
                            WHERE TRUE${exclusion}
                            ORDER BY RANDOM()
                            LIMIT 1
                        `,
                        uniqueIds
                    );
                    queryCount = 1;
                } else {
                    strategyUsed = 'indexed';
                    const randomValue = random();
                    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
                        throw new Error('random must return a number greater than or equal to 0 and less than 1');
                    }
                    const randomValuePlaceholder = `$${uniqueIds.length + 1}`;
                    const params = [...uniqueIds, randomValue];

                    // 固定random_keyの隙間で選ぶと惑星ごとの確率が偏るため、除外後の候補番号を等確率で選ぶ。
                    result = await pool.query(
                        `
                            SELECT ${RANDOM_PLANET_COLUMNS}
                            FROM planets
                            WHERE TRUE${exclusion}
                            ORDER BY random_key
                            OFFSET (
                                SELECT FLOOR(
                                    ${randomValuePlaceholder}::double precision
                                    * COUNT(*)::double precision
                                )::bigint
                                FROM planets
                                WHERE TRUE${exclusion}
                            )
                            LIMIT 1
                        `,
                        params
                    );
                    queryCount = 1;
                }
                return mapPlanetRow(result.rows[0]);
            } catch (error) {
                queryError = error;
                throw error;
            } finally {
                try {
                    onRandomQueryTiming?.({
                        durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
                        exclusionCount: uniqueIds.length,
                        returnedRows: result?.rows?.length ?? 0,
                        queryCount,
                        strategy: strategyUsed,
                        poolBefore,
                        poolAfter: snapshotPool(pool),
                        error: queryError ? safeErrorMetadata(queryError) : null
                    });
                } catch {
                    // Performance logging must never affect the query result.
                }
            }
        },
    };
}
