import { calculateLoginProgress } from '../../application/login-progress.js';

const PLANET_COLUMNS = `
    github_id, username, planet_color, planet_size_factor, main_language, language_stats,
    total_commits, weekly_commits, last_updated, planet_name, achievements, unlocked_titles,
    active_title
`;

const PLANET_LOOKUP_COLUMNS = `
    github_id, username, planet_color, planet_size_factor, main_language, language_stats,
    total_commits, weekly_commits, last_updated, planet_name, achievements, active_title
`;

const RANDOM_PLANET_COLUMNS = `
    github_id, username, planet_color, planet_size_factor, main_language, language_stats,
    total_commits, weekly_commits, planet_name, achievements, active_title
`;

const RANDOM_QUERY_STRATEGIES = new Set(['auto', 'indexed', 'legacy']);
const RANDOM_COUNT_REFRESH_MS = 5 * 60 * 1_000;

function snapshotPool(pool) {
    return {
        totalCount: Number.isInteger(pool.totalCount) ? pool.totalCount : null,
        idleCount: Number.isInteger(pool.idleCount) ? pool.idleCount : null,
        waitingCount: Number.isInteger(pool.waitingCount) ? pool.waitingCount : null
    };
}

export function createPlanetRepository(pool, {
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
                console.warn(`[DB] ランダム検索用人数更新をスキップ: ${error.message}`);
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

        async findByGithubId(githubId) {
            const result = await pool.query(
                `SELECT ${PLANET_COLUMNS} FROM planets WHERE github_id = $1`,
                [githubId]
            );
            return result.rows[0] || null;
        },

        async findByUsername(username) {
            const result = await pool.query(
                `SELECT ${PLANET_LOOKUP_COLUMNS}
                 FROM planets
                 WHERE LOWER(username) = LOWER($1)`,
                [username]
            );
            return result.rows[0] || null;
        },

        async findLanguageColor(language) {
            const result = await pool.query(
                `SELECT color FROM language_color_cache WHERE language = $1`,
                [language]
            );
            return result.rows[0]?.color || null;
        },

        async saveLanguageColor(language, color) {
            const result = await pool.query(`
                INSERT INTO language_color_cache (language, color, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (language) DO UPDATE SET
                    color = EXCLUDED.color,
                    updated_at = NOW()
                RETURNING color
            `, [language, color]);
            return result.rows[0]?.color || color;
        },

        async loadLanguageColorCache() {
            try {
                const result = await pool.query(
                    'SELECT language, color FROM language_color_cache'
                );
                return Object.fromEntries(result.rows.map((row) => [row.language, row.color]));
            } catch (error) {
                // 起動時の最適化なので、キャッシュ表の一時障害で本体を停止させない。
                console.warn(`[DB] 言語色キャッシュの事前読込をスキップ: ${error.message}`);
                return {};
            }
        },

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
                return result.rows[0] || null;
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
                        error: queryError?.message || null
                    });
                } catch {
                    // Performance logging must never affect the query result.
                }
            }
        },

        async updateActiveTitle(githubId, activeTitle) {
            await pool.query('UPDATE planets SET active_title = $1 WHERE github_id = $2', [activeTitle, githubId]);
        },

        async recordLoginProgress(githubId, {
            currentContributions,
            currentAchievementIds,
            notifyCurrentAchievements
        }) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const result = await client.query(`
                    SELECT last_login_contributions, notified_achievement_ids
                    FROM planets
                    WHERE github_id = $1
                    FOR UPDATE
                `, [githubId]);
                const row = result.rows[0];
                if (!row) throw new Error('Planet not found while recording login progress');

                const progress = calculateLoginProgress({
                    previousContributions: row.last_login_contributions,
                    previousNotifiedAchievementIds: row.notified_achievement_ids,
                    currentContributions,
                    currentAchievementIds,
                    notifyCurrentAchievements
                });

                await client.query(`
                    UPDATE planets
                    SET last_login_contributions = $2,
                        last_login_at = NOW(),
                        notified_achievement_ids = $3
                    WHERE github_id = $1
                `, [githubId, currentContributions, JSON.stringify(progress.achievementBaselineIds)]);
                await client.query('COMMIT');
                return {
                    contributionDelta: progress.contributionDelta,
                    newlyUnlockedAchievementIds: progress.newlyUnlockedAchievementIds
                };
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        },

        async save(planet) {
            await pool.query(`
                INSERT INTO planets (github_id, username, planet_color, planet_size_factor, main_language, language_stats, total_commits, last_updated, achievements, planet_name, weekly_commits, unlocked_titles, active_title)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12)
                ON CONFLICT (github_id) DO UPDATE SET
                    username = $2, planet_color = $3, planet_size_factor = $4, main_language = $5,
                    language_stats = $6, total_commits = $7, last_updated = NOW(), achievements = $8, planet_name = $9, weekly_commits = $10, unlocked_titles = $11
            `, [
                planet.githubId, planet.username, planet.planetColor, planet.planetSizeFactor,
                planet.mainLanguage, planet.languageStats, planet.totalCommits, planet.achievements,
                planet.planetName, planet.weeklyCommits, planet.unlockedTitles, planet.activeTitle
            ]);
        }
    };
}
