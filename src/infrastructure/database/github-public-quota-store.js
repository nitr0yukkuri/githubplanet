export function createGithubPublicQuotaStore(pool) {
    if (!pool) return undefined;
    return {
        async reserve(key, limit, windowMs) {
            const result = await pool.query(`
                INSERT INTO github_profile_lookup_quota (quota_key, window_started_at, request_count, blocked_until)
                VALUES ($1, NOW(), 1, NULL)
                ON CONFLICT (quota_key) DO UPDATE SET
                    window_started_at = CASE WHEN github_profile_lookup_quota.window_started_at
                        <= NOW() - ($3::bigint * INTERVAL '1 millisecond') THEN NOW()
                        ELSE github_profile_lookup_quota.window_started_at END,
                    request_count = CASE WHEN github_profile_lookup_quota.window_started_at
                        <= NOW() - ($3::bigint * INTERVAL '1 millisecond') THEN 1
                        ELSE github_profile_lookup_quota.request_count + 1 END,
                    blocked_until = NULL
                WHERE (github_profile_lookup_quota.blocked_until IS NULL OR github_profile_lookup_quota.blocked_until <= NOW())
                    AND (github_profile_lookup_quota.request_count < $2 OR github_profile_lookup_quota.window_started_at
                        <= NOW() - ($3::bigint * INTERVAL '1 millisecond'))
                RETURNING quota_key
            `, [key, limit, windowMs]);
            if (result.rowCount) return { allowed: true };
            const blocked = await pool.query(`
                SELECT GREATEST(blocked_until, CASE WHEN request_count >= $3
                    THEN window_started_at + ($2::bigint * INTERVAL '1 millisecond') ELSE NOW() END) AS retry_at,
                    NOW() AS current_time FROM github_profile_lookup_quota WHERE quota_key = $1
            `, [key, windowMs, limit]);
            const row = blocked.rows[0];
            return { allowed: false, retryAfterMs: row ? Math.max(1000, new Date(row.retry_at) - new Date(row.current_time)) : 1000 };
        },
        async block(key, until) {
            // GitHub側のリセット時刻から新しい窓を始め、別インスタンスも同じ待機状態を共有する。
            await pool.query(`
                INSERT INTO github_profile_lookup_quota (quota_key, window_started_at, request_count, blocked_until)
                VALUES ($1, $2, 0, $2)
                ON CONFLICT (quota_key) DO UPDATE SET window_started_at = GREATEST(github_profile_lookup_quota.window_started_at, $2),
                    request_count = 0, blocked_until = GREATEST(github_profile_lookup_quota.blocked_until, $2)
            `, [key, new Date(until)]);
        }
    };
}
