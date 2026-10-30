import { safeErrorMetadata } from '../../shared/error-metadata.js';

export function createLanguageColorRepository(pool) {
    if (!pool) return undefined;
    return {
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
    };
}
