export function createPlanetRepository(pool) {
    if (!pool) return undefined;

    return {
        async findByGithubId(githubId) {
            const result = await pool.query('SELECT * FROM planets WHERE github_id = $1', [githubId]);
            return result.rows[0] || null;
        },

        async findByUsername(username) {
            const result = await pool.query('SELECT * FROM planets WHERE username = $1', [username]);
            return result.rows[0] || null;
        },

        async findRandom(excludeIds = []) {
            if (excludeIds.length === 0) {
                const result = await pool.query('SELECT * FROM planets ORDER BY RANDOM() LIMIT 1');
                return result.rows[0] || null;
            }
            const uniqueIds = [...new Set(excludeIds)];
            const placeholders = uniqueIds.map((_, index) => `$${index + 1}`).join(', ');
            const result = await pool.query(
                `SELECT * FROM planets WHERE github_id NOT IN (${placeholders}) ORDER BY RANDOM() LIMIT 1`,
                uniqueIds
            );
            return result.rows[0] || null;
        },

        async updateActiveTitle(githubId, activeTitle) {
            await pool.query('UPDATE planets SET active_title = $1 WHERE github_id = $2', [activeTitle, githubId]);
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
