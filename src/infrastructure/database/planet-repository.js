import { mapPlanetRow, PLANET_COLUMNS, PLANET_LOOKUP_COLUMNS } from './planet-row.js';
import { createRandomPlanetReader } from './random-planet-reader.js';
import { createLoginProgressStore } from './login-progress-store.js';

// planet集約の操作だけを公開し、別テーブルの保存処理はComposition Rootで個別に注入する。
export function createPlanetRepository(pool, options = {}) {
    if (!pool) return undefined;
    return {
        ...createRandomPlanetReader(pool, options),
        ...createLoginProgressStore(pool),

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
        },
    };
}
