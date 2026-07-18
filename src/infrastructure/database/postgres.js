import pg from 'pg';

export function createPostgresPool(connectionString) {
    if (!connectionString) return undefined;
    const isLocalDatabase = connectionString.includes('@localhost')
        || connectionString.includes('@127.0.0.1')
        || connectionString.includes('@db')
        || connectionString.includes('localhost');

    return new pg.Pool({
        connectionString,
        ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false }
    });
}

export function prepareDatabase(pool) {
    if (!pool) {
        console.warn('[DB] データベース接続文字列(DATABASE_URL)が設定されていません。DB機能は無効になります。');
        return;
    }

    pool.query(`
        CREATE TABLE IF NOT EXISTS planets (
            github_id BIGINT PRIMARY KEY,
            username TEXT NOT NULL,
            planet_color TEXT,
            planet_size_factor REAL,
            main_language TEXT,
            language_stats JSONB,
            total_commits INTEGER,
            last_updated TIMESTAMP DEFAULT NOW(),
            planet_name TEXT
        );
    `)
        .then(() => {
            console.log('[DB] planetsテーブルの準備ができました');
            return pool.query(`ALTER TABLE planets ADD COLUMN IF NOT EXISTS achievements JSONB DEFAULT '{}'::jsonb;`);
        })
        .then(() => pool.query(`ALTER TABLE planets ADD COLUMN IF NOT EXISTS planet_name TEXT;`))
        .then(() => pool.query(`ALTER TABLE planets ADD COLUMN IF NOT EXISTS weekly_commits INTEGER DEFAULT 0;`))
        .then(() => pool.query(`
            ALTER TABLE planets
            ADD COLUMN IF NOT EXISTS unlocked_titles JSONB DEFAULT '{"prefixes": ["名もなき"], "suffixes": ["旅人"]}'::jsonb,
            ADD COLUMN IF NOT EXISTS active_title JSONB DEFAULT '{"prefix": "名もなき", "suffix": "旅人"}'::jsonb;
        `))
        .then(() => pool.query(`CREATE INDEX IF NOT EXISTS idx_planets_username ON planets(username);`))
        .then(() => console.log('[DB] カラムとインデックスの準備ができました'))
        .catch((error) => console.error('[DB] テーブル作成/接続に失敗しました (ローカルDBが起動していない可能性があります):', error.message));
}
