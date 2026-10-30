import { calculateLoginProgress } from '../../domain/planet/login-progress.js';

export function createLoginProgressStore(pool) {
    if (!pool) return undefined;
    return {
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
    };
}
