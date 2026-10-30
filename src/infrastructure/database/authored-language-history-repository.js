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


export function createAuthoredLanguageHistoryRepository(pool) {
    if (!pool) return undefined;
    return {
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
    };
}
