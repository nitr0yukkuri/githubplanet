import { calculateLoginProgress } from '../../domain/planet/login-progress.js';
import { safeErrorMetadata } from '../../shared/error-metadata.js';

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

function mapPlanetRow(row) {
    if (!row) return null;

    // DB列名はこのアダプターで吸収し、利用側にはアプリ用の名前だけを渡す。
    return {
        githubId: row.github_id,
        username: row.username,
        planetColor: row.planet_color,
        planetSizeFactor: row.planet_size_factor,
        mainLanguage: row.main_language,
        languageStats: row.language_stats,
        totalCommits: row.total_commits,
        weeklyCommits: row.weekly_commits,
        lastUpdated: row.last_updated,
        planetName: row.planet_name,
        achievements: row.achievements,
        unlockedTitles: row.unlocked_titles,
        activeTitle: row.active_title
    };
}

function mapAuthoredLanguageScan(row) {
    if (!row) return null;
    return {
        scanStatus: row.scan_status,
        scanStartedAt: row.scan_started_at,
        scanCompletedAt: row.scan_completed_at,
        updatedAt: row.updated_at,
        retryAfter: row.retry_after,
        lastError: row.last_error,
        repositoriesScanned: row.repositories_scanned,
        privateRepositoriesSkipped: row.private_repositories_skipped,
        commitsFound: row.commits_found,
        commitsScanned: row.commits_scanned,
        unavailableCommits: row.unavailable_commits,
        incompleteFileCommits: row.incomplete_file_commits,
        unclassifiedAddedLines: row.unclassified_added_lines,
        repositoryCapReached: row.repository_cap_reached,
        apiRequests: row.api_requests,
        requestBudgetReached: row.request_budget_reached,
        scanCursor: row.scan_cursor || {}
    };
}

function progressValues(progress) {
    return [
        progress.repositoriesScanned,
        progress.privateRepositoriesSkipped,
        progress.commitsFound,
        progress.commitsScanned,
        progress.unavailableCommits,
        progress.incompleteFileCommits,
        progress.unclassifiedAddedLines,
        progress.repositoryCapReached,
        progress.apiRequests,
        progress.requestBudgetReached,
        progress.scanCursor || {}
    ];
}

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
    let lastWebhookDeliveryCleanupAt = 0;

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

        async claimGithubWebhookDelivery(deliveryId, payloadHash) {
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deliveryId || '')) {
                throw new Error('Invalid GitHub webhook delivery ID');
            }
            if (!/^[0-9a-f]{64}$/.test(payloadHash || '')) {
                throw new Error('Invalid GitHub webhook payload hash');
            }

            const now = Date.now();
            if (now - lastWebhookDeliveryCleanupAt >= 60 * 60 * 1_000) {
                await pool.query(`
                    DELETE FROM github_webhook_deliveries
                    WHERE received_at < NOW() - INTERVAL '30 days'
                `);
                lastWebhookDeliveryCleanupAt = now;
            }

            const result = await pool.query(`
                INSERT INTO github_webhook_deliveries (delivery_id, payload_sha256)
                VALUES ($1::uuid, $2)
                ON CONFLICT DO NOTHING
                RETURNING delivery_id
            `, [deliveryId, payloadHash]);
            return result.rowCount === 1;
        },

        async findByGithubId(githubId) {
            const result = await pool.query(
                `SELECT ${PLANET_COLUMNS} FROM planets WHERE github_id = $1`,
                [githubId]
            );
            return mapPlanetRow(result.rows[0]);
        },

        async findByUsername(username) {
            const result = await pool.query(
                `SELECT ${PLANET_LOOKUP_COLUMNS}
                 FROM planets
                 WHERE LOWER(username) = LOWER($1)`,
                [username]
            );
            return mapPlanetRow(result.rows[0]);
        },

        async updateUsernameByGithubId(githubId, username) {
            await pool.query(
                'UPDATE planets SET username = $2 WHERE github_id = $1 AND username IS DISTINCT FROM $2',
                [githubId, username]
            );
        },

        async findLanguageHistoryByGithubId(githubId) {
            const result = await pool.query(`
                SELECT captured_at, main_language, planet_color, language_percentages
                FROM planet_language_snapshots
                WHERE github_id = $1
                ORDER BY captured_at ASC
            `, [githubId]);
            // DB列名はRepositoryで変換し、Application層へSQLスキーマを漏らさない。
            return result.rows.map((row) => ({
                capturedAt: row.captured_at,
                mainLanguage: row.main_language,
                planetColor: row.planet_color,
                languagePercentages: row.language_percentages
            }));
        },

        async findAuthoredLanguageCommitKeys(githubId) {
            const result = await pool.query(`
                SELECT repository_full_name, commit_sha
                FROM authored_language_commits
                WHERE github_id = $1
            `, [githubId]);
            return result.rows.map(({ repository_full_name, commit_sha }) => ({
                repositoryFullName: repository_full_name,
                commitSha: commit_sha
            }));
        },

        async findAuthoredLanguageCommits(githubId) {
            const result = await pool.query(`
                SELECT commit_sha, authored_at, language_added_lines
                FROM authored_language_commits
                WHERE github_id = $1
                ORDER BY authored_at ASC
            `, [githubId]);
            return result.rows.map(({ commit_sha, authored_at, language_added_lines }) => ({
                commitSha: commit_sha,
                authoredAt: authored_at,
                languageAdditions: language_added_lines
            }));
        },

        async saveAuthoredLanguageCommits(githubId, commits) {
            if (!Array.isArray(commits) || commits.length === 0) return 0;
            const rows = commits.map((commit) => ({
                repository_full_name: commit.repositoryFullName,
                commit_sha: commit.commitSha,
                authored_at: commit.authoredAt,
                language_added_lines: commit.languageAdditions,
                total_added_lines: commit.totalAddedLines,
                unclassified_added_lines: commit.unclassifiedAddedLines,
                files_complete: commit.filesComplete
            }));
            const result = await pool.query(`
                INSERT INTO authored_language_commits (
                    github_id, repository_full_name, commit_sha, authored_at,
                    language_added_lines, total_added_lines, unclassified_added_lines, files_complete
                )
                SELECT $1, item.repository_full_name, item.commit_sha, item.authored_at,
                    item.language_added_lines, item.total_added_lines,
                    item.unclassified_added_lines, item.files_complete
                FROM jsonb_to_recordset($2::jsonb) AS item(
                    repository_full_name TEXT,
                    commit_sha TEXT,
                    authored_at TIMESTAMPTZ,
                    language_added_lines JSONB,
                    total_added_lines INTEGER,
                    unclassified_added_lines INTEGER,
                    files_complete BOOLEAN
                )
                ON CONFLICT (github_id, repository_full_name, commit_sha) DO NOTHING
            `, [githubId, JSON.stringify(rows)]);
            return result.rowCount;
        },

        async tryStartAuthoredLanguageHistoryScan(githubId, ttlMs) {
            const result = await pool.query(`
                INSERT INTO authored_language_history_scans (
                    github_id, scan_status, scan_started_at, updated_at, retry_after
                ) VALUES ($1, 'running', NOW(), NOW(), NULL)
                ON CONFLICT (github_id) DO UPDATE SET
                    scan_status = 'running',
                    scan_started_at = NOW(),
                    scan_completed_at = NULL,
                    updated_at = NOW(),
                    retry_after = NULL,
                    last_error = NULL,
                    repositories_scanned = CASE WHEN authored_language_history_scans.scan_status IN ('partial', 'failed', 'running')
                        AND NOT authored_language_history_scans.request_budget_reached THEN authored_language_history_scans.repositories_scanned ELSE 0 END,
                    private_repositories_skipped = CASE WHEN authored_language_history_scans.scan_status IN ('partial', 'failed', 'running')
                        AND NOT authored_language_history_scans.request_budget_reached THEN authored_language_history_scans.private_repositories_skipped ELSE 0 END,
                    commits_found = CASE WHEN authored_language_history_scans.scan_status IN ('partial', 'failed', 'running')
                        AND NOT authored_language_history_scans.request_budget_reached THEN authored_language_history_scans.commits_found ELSE 0 END,
                    commits_scanned = CASE WHEN authored_language_history_scans.scan_status IN ('partial', 'failed', 'running')
                        AND NOT authored_language_history_scans.request_budget_reached THEN authored_language_history_scans.commits_scanned ELSE 0 END,
                    unavailable_commits = CASE WHEN authored_language_history_scans.scan_status IN ('partial', 'failed', 'running')
                        AND NOT authored_language_history_scans.request_budget_reached THEN authored_language_history_scans.unavailable_commits ELSE 0 END,
                    incomplete_file_commits = CASE WHEN authored_language_history_scans.scan_status IN ('partial', 'failed', 'running')
                        AND NOT authored_language_history_scans.request_budget_reached THEN authored_language_history_scans.incomplete_file_commits ELSE 0 END,
                    unclassified_added_lines = CASE WHEN authored_language_history_scans.scan_status IN ('partial', 'failed', 'running')
                        AND NOT authored_language_history_scans.request_budget_reached THEN authored_language_history_scans.unclassified_added_lines ELSE 0 END,
                    repository_cap_reached = CASE WHEN authored_language_history_scans.scan_status IN ('partial', 'failed', 'running')
                        AND NOT authored_language_history_scans.request_budget_reached THEN authored_language_history_scans.repository_cap_reached ELSE FALSE END,
                    api_requests = CASE WHEN authored_language_history_scans.scan_status IN ('partial', 'failed', 'running')
                        AND NOT authored_language_history_scans.request_budget_reached THEN authored_language_history_scans.api_requests ELSE 0 END,
                    scan_cursor = CASE WHEN authored_language_history_scans.scan_status IN ('partial', 'failed', 'running')
                        THEN authored_language_history_scans.scan_cursor ELSE '{}'::jsonb END,
                    request_budget_reached = FALSE
                WHERE authored_language_history_scans.scan_status = 'idle'
                    OR (authored_language_history_scans.scan_status = 'complete'
                        AND authored_language_history_scans.scan_completed_at
                            < NOW() - ($2::bigint * INTERVAL '1 millisecond'))
                    OR (authored_language_history_scans.scan_status IN ('partial', 'failed')
                        AND authored_language_history_scans.retry_after <= NOW())
                    OR (authored_language_history_scans.scan_status = 'running'
                        AND authored_language_history_scans.updated_at < NOW() - INTERVAL '30 minutes')
                RETURNING *
            `, [githubId, ttlMs]);
            return mapAuthoredLanguageScan(result.rows[0]);
        },

        async updateAuthoredLanguageHistoryScan(githubId, progress) {
            await pool.query(`
                UPDATE authored_language_history_scans
                SET updated_at = NOW(),
                    repositories_scanned = $2,
                    private_repositories_skipped = $3,
                    commits_found = $4,
                    commits_scanned = $5,
                    unavailable_commits = $6,
                    incomplete_file_commits = $7,
                    unclassified_added_lines = $8,
                    repository_cap_reached = $9,
                    api_requests = $10,
                    request_budget_reached = $11,
                    scan_cursor = $12
                WHERE github_id = $1 AND scan_status = 'running'
            `, [githubId, ...progressValues(progress)]);
        },

        async completeAuthoredLanguageHistoryScan(githubId, progress) {
            const result = await pool.query(`
                UPDATE authored_language_history_scans
                SET scan_status = 'complete', scan_completed_at = NOW(), updated_at = NOW(),
                    retry_after = NULL, last_error = NULL,
                    repositories_scanned = $2, private_repositories_skipped = $3,
                    commits_found = $4, commits_scanned = $5, unavailable_commits = $6,
                    incomplete_file_commits = $7, unclassified_added_lines = $8,
                    repository_cap_reached = $9, api_requests = $10, request_budget_reached = $11,
                    scan_cursor = $12
                WHERE github_id = $1 AND scan_status = 'running'
                RETURNING *
            `, [githubId, ...progressValues(progress)]);
            return mapAuthoredLanguageScan(result.rows[0]);
        },

        async pauseAuthoredLanguageHistoryScan(githubId, progress, retryAfterMs) {
            const result = await pool.query(`
                UPDATE authored_language_history_scans
                SET scan_status = 'partial', updated_at = NOW(),
                    retry_after = NOW() + (LEAST($12::bigint, 21600000) * INTERVAL '1 millisecond'),
                    last_error = CASE WHEN $13 THEN 'GitHub history request budget reached; scan will resume after cooldown' ELSE NULL END,
                    repositories_scanned = $2, private_repositories_skipped = $3,
                    commits_found = $4, commits_scanned = $5, unavailable_commits = $6,
                    incomplete_file_commits = $7, unclassified_added_lines = $8,
                    repository_cap_reached = $9, api_requests = $10, scan_cursor = $11,
                    request_budget_reached = $13
                WHERE github_id = $1 AND scan_status = 'running'
                RETURNING *
            `, [
                githubId,
                ...progressValues(progress).slice(0, 9),
                progress.scanCursor || {},
                Math.max(0, Math.trunc(Number(retryAfterMs) || 0)),
                Boolean(progress.requestBudgetReached)
            ]);
            return mapAuthoredLanguageScan(result.rows[0]);
        },

        async failAuthoredLanguageHistoryScan(githubId, message, retryAfterMs = 0, progress = null) {
            const result = await pool.query(`
                UPDATE authored_language_history_scans
                SET scan_status = 'failed', updated_at = NOW(),
                    retry_after = NOW() + (LEAST(GREATEST($3::bigint, 30000), 3600000) * INTERVAL '1 millisecond'),
                    last_error = $2,
                    repositories_scanned = COALESCE($4, repositories_scanned),
                    private_repositories_skipped = COALESCE($5, private_repositories_skipped),
                    commits_found = COALESCE($6, commits_found),
                    commits_scanned = COALESCE($7, commits_scanned),
                    unavailable_commits = COALESCE($8, unavailable_commits),
                    incomplete_file_commits = COALESCE($9, incomplete_file_commits),
                    unclassified_added_lines = COALESCE($10, unclassified_added_lines),
                    repository_cap_reached = COALESCE($11, repository_cap_reached),
                    api_requests = COALESCE($12, api_requests),
                    request_budget_reached = COALESCE($13, request_budget_reached),
                    scan_cursor = COALESCE($14, scan_cursor)
                WHERE github_id = $1 AND scan_status = 'running'
                RETURNING *
            `, [
                githubId,
                String(message || 'GitHub history scan failed').slice(0, 500),
                retryAfterMs,
                ...(progress ? progressValues(progress) : Array(11).fill(null))
            ]);
            return mapAuthoredLanguageScan(result.rows[0]);
        },

        async getAuthoredLanguageHistoryScan(githubId) {
            const result = await pool.query(`
                SELECT * FROM authored_language_history_scans WHERE github_id = $1
            `, [githubId]);
            return mapAuthoredLanguageScan(result.rows[0]);
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
                console.warn('[DB] 言語色キャッシュの事前読込をスキップ:', safeErrorMetadata(error));
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

