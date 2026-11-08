const DAY_MS = 86_400_000;
const MAX_RETRY_DELAY_MS = 30 * DAY_MS;

function validateHistory(history) {
    const startedAt = Date.parse(history?.calendarStartedAt);
    const capturedAt = Date.parse(history?.capturedAt);
    const years = history?.calendarYears;
    const days = history?.dailyContributions;
    if (!Number.isFinite(startedAt) || !Number.isFinite(capturedAt) || startedAt > capturedAt
        || !Array.isArray(years) || !years.length || !Array.isArray(days)) {
        throw new Error('Invalid public contribution history');
    }

    const firstYear = new Date(startedAt).getUTCFullYear();
    const lastYear = new Date(capturedAt).getUTCFullYear();
    if (years.length !== lastYear - firstYear + 1
        || years.some((year, index) => year !== firstYear + index)) {
        throw new Error('Incomplete public contribution history years');
    }

    const firstDate = new Date(startedAt).toISOString().slice(0, 10);
    const lastDate = new Date(capturedAt).toISOString().slice(0, 10);
    const expectedDays = Math.floor((Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / DAY_MS) + 1;
    const seen = new Set();
    const positiveDays = [];
    for (const day of days) {
        const date = String(day?.date || '');
        const timestamp = Date.parse(`${date}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < firstDate || date > lastDate
            || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date
            || !Number.isSafeInteger(day.contributionCount) || day.contributionCount < 0
            || seen.has(date)
            || (day.contributionCountIsLowerBound !== undefined && typeof day.contributionCountIsLowerBound !== 'boolean')) {
            throw new Error('Invalid public contribution history day');
        }
        seen.add(date);
        if (day.contributionCount > 0 || day.contributionCountIsLowerBound) {
            positiveDays.push({
                date,
                contributionCount: day.contributionCount,
                ...(day.contributionCountIsLowerBound ? { contributionCountIsLowerBound: true } : {})
            });
        }
    }
    if (seen.size !== expectedDays) throw new Error('Incomplete public contribution history days');

    return {
        githubLogin: String(history.githubLogin || ''),
        calendarStartedAt: new Date(startedAt).toISOString(),
        calendarYears: years,
        dailyContributions: positiveDays,
        capturedAt: new Date(capturedAt).toISOString()
    };
}

export function createPublicContributionHistoryRepository(pool) {
    if (!pool) return undefined;

    return {
        async findPublicContributionHistory(githubId) {
            const { rows } = await pool.query(`
                SELECT github_login, calendar_started_at, calendar_years, daily_contributions, captured_at
                FROM planet_public_contribution_histories
                WHERE github_id = $1
            `, [githubId]);
            const row = rows[0];
            return row ? {
                githubLogin: row.github_login,
                calendarStartedAt: row.calendar_started_at,
                calendarYears: row.calendar_years,
                dailyContributions: row.daily_contributions,
                capturedAt: row.captured_at
            } : null;
        },

        async savePublicContributionHistory(githubId, history) {
            const safeHistory = validateHistory(history);
            if (!/^[1-9]\d{0,19}$/.test(String(githubId))
                || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(safeHistory.githubLogin)) {
                throw new Error('Invalid public contribution history identity');
            }

            const result = await pool.query(`
                -- 履歴本体が同じならJSONBを再書き込みせず、TOASTの増殖と不要なI/Oを避ける。
                WITH saved AS (
                    INSERT INTO planet_public_contribution_histories (
                        github_id, github_login, calendar_started_at, calendar_years, daily_contributions, captured_at
                    ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
                    ON CONFLICT (github_id) DO UPDATE SET
                        github_login = EXCLUDED.github_login,
                        calendar_started_at = EXCLUDED.calendar_started_at,
                        calendar_years = CASE
                            WHEN planet_public_contribution_histories.calendar_years IS DISTINCT FROM EXCLUDED.calendar_years
                            THEN EXCLUDED.calendar_years
                            ELSE planet_public_contribution_histories.calendar_years
                        END,
                        daily_contributions = CASE
                            WHEN planet_public_contribution_histories.daily_contributions IS DISTINCT FROM EXCLUDED.daily_contributions
                            THEN EXCLUDED.daily_contributions
                            ELSE planet_public_contribution_histories.daily_contributions
                        END,
                        captured_at = EXCLUDED.captured_at
                    WHERE planet_public_contribution_histories.captured_at < EXCLUDED.captured_at
                    RETURNING github_id, captured_at
                ), scheduled AS (
                    INSERT INTO planet_public_history_refresh_jobs (github_id, next_attempt_at)
                    SELECT github_id, captured_at + INTERVAL '30 days' FROM saved
                    ON CONFLICT (github_id) DO UPDATE SET
                        next_attempt_at = EXCLUDED.next_attempt_at,
                        lease_until = NULL,
                        failure_count = 0,
                        last_failure_code = NULL,
                        updated_at = NOW()
                    RETURNING github_id
                )
                SELECT github_id FROM scheduled
            `, [
                githubId,
                safeHistory.githubLogin,
                safeHistory.calendarStartedAt,
                JSON.stringify(safeHistory.calendarYears),
                JSON.stringify(safeHistory.dailyContributions),
                safeHistory.capturedAt
            ]);
            return result.rowCount > 0;
        },

        async claimNextPublicHistoryRefresh() {
            // Actionsの再実行や重複起動でも同じプロフィールを二重取得しないよう、短いlease付きで一件だけclaimする。
            const { rows } = await pool.query(`
                WITH candidate AS (
                    SELECT job.github_id
                    FROM planet_public_history_refresh_jobs AS job
                    JOIN planets AS planet USING (github_id)
                    WHERE job.next_attempt_at <= NOW()
                      AND (job.lease_until IS NULL OR job.lease_until <= NOW())
                    ORDER BY job.next_attempt_at, job.github_id
                    FOR UPDATE OF job SKIP LOCKED
                    LIMIT 1
                )
                UPDATE planet_public_history_refresh_jobs AS job
                SET lease_until = NOW() + INTERVAL '10 minutes', updated_at = NOW()
                FROM candidate
                JOIN planets AS planet USING (github_id)
                WHERE job.github_id = candidate.github_id
                RETURNING job.github_id, planet.username, job.failure_count
            `);
            const row = rows[0];
            return row ? {
                githubId: String(row.github_id),
                username: row.username,
                failureCount: Number(row.failure_count) || 0
            } : null;
        },

        async completePublicHistoryRefresh(githubId) {
            await pool.query(`
                UPDATE planet_public_history_refresh_jobs
                SET next_attempt_at = NOW() + INTERVAL '30 days',
                    lease_until = NULL,
                    failure_count = 0,
                    last_failure_code = NULL,
                    updated_at = NOW()
                WHERE github_id = $1
            `, [githubId]);
        },

        async failPublicHistoryRefresh(githubId, { retryAfterMs, failureCode }) {
            const delay = Math.min(MAX_RETRY_DELAY_MS, Math.max(60_000, Math.trunc(Number(retryAfterMs) || 60_000)));
            const code = /^[A-Z0-9_-]{1,40}$/.test(String(failureCode || '')) ? String(failureCode) : 'REFRESH_FAILED';
            await pool.query(`
                UPDATE planet_public_history_refresh_jobs
                SET next_attempt_at = NOW() + ($2::double precision * INTERVAL '1 millisecond'),
                    lease_until = NULL,
                    failure_count = failure_count + 1,
                    last_failure_code = $3,
                    updated_at = NOW()
                WHERE github_id = $1
            `, [githubId, delay, code]);
        }
    };
}
