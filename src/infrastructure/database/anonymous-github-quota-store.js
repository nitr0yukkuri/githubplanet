export function createAnonymousGithubQuotaStore(pool) {
    let lastGithubLookupQuotaCleanupAt = 0;
    return {
        async reserveGithubProfileLookup(requesterKey, limit, windowMs) {
            if (!/^[0-9a-f]{64}$/.test(requesterKey || '')) {
                throw new Error('Invalid anonymous GitHub lookup key');
            }
            if (!Number.isInteger(limit) || limit < 1
                || !Number.isInteger(windowMs) || windowMs < 1) {
                throw new Error('Invalid anonymous GitHub lookup quota');
            }

            const now = Date.now();
            if (now - lastGithubLookupQuotaCleanupAt >= 60 * 60 * 1_000) {
                await pool.query(`
                    DELETE FROM github_profile_lookup_quota
                    WHERE quota_key LIKE 'anonymous-client:%' AND window_started_at < NOW() - INTERVAL '24 hours'
                `);
                lastGithubLookupQuotaCleanupAt = now;
            }

            const result = await pool.query(`
                INSERT INTO github_profile_lookup_quota AS quota (
                    quota_key, window_started_at, request_count
                )
                VALUES ('anonymous-client:' || $1, NOW(), 1)
                ON CONFLICT (quota_key) DO UPDATE SET
                    window_started_at = CASE
                        WHEN quota.window_started_at <= NOW() - ($2 * INTERVAL '1 millisecond') THEN NOW()
                        ELSE quota.window_started_at
                    END,
                    request_count = CASE
                        WHEN quota.window_started_at <= NOW() - ($2 * INTERVAL '1 millisecond') THEN 1
                        ELSE quota.request_count + 1
                    END
                RETURNING request_count, window_started_at
            `, [requesterKey, windowMs]);
            // ON CONFLICTの更新をDBに直列化させ、複数インスタンスからの同時予約も数える。
            const row = result.rows[0];
            const requestCount = Number(row?.request_count || 0);
            const retryAfterMs = Math.max(
                0,
                new Date(row?.window_started_at || now).getTime() + windowMs - now
            );
            return { allowed: requestCount <= limit, retryAfterMs };
        },

    };
}
