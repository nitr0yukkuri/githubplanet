import pg from 'pg';

export function createPostgresPool(connectionString) {
    if (!connectionString) return undefined;
    const isLocalDatabase = connectionString.includes('@localhost')
        || connectionString.includes('@127.0.0.1')
        || connectionString.includes('@db')
        || connectionString.includes('localhost');

    const pool = new pg.Pool({
        connectionString,
        ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
        max: 5,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 60000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        query_timeout: 15000,
        statement_timeout: 15000
    });

    pool.on('error', (error) => {
        console.error(`[DB] Idle client connection error: ${error.message}`);
    });

    return pool;
}

export function prepareDatabase(pool) {
    if (!pool) {
        console.warn('[DB] データベース接続文字列(DATABASE_URL)が設定されていません。DB機能は無効になります。');
        return Promise.resolve(false);
    }

    return pool.query(`
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
        .then(() => pool.query(`
            CREATE TABLE IF NOT EXISTS "session" (
                sid VARCHAR PRIMARY KEY,
                sess JSON NOT NULL,
                expire TIMESTAMP(6) NOT NULL
            );
            CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" (expire);
        `))
        .then(() => pool.query(`
            CREATE TABLE IF NOT EXISTS language_color_cache (
                language TEXT PRIMARY KEY,
                color TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `))
        .then(() => pool.query(`ALTER TABLE planets ADD COLUMN IF NOT EXISTS planet_name TEXT;`))
        .then(() => pool.query(`ALTER TABLE planets ADD COLUMN IF NOT EXISTS weekly_commits INTEGER DEFAULT 0;`))
        .then(() => pool.query(`
            ALTER TABLE planets
            ADD COLUMN IF NOT EXISTS last_login_contributions BIGINT,
            ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS notified_achievement_ids JSONB;
        `))
        .then(() => pool.query(`
            ALTER TABLE planets
            ADD COLUMN IF NOT EXISTS unlocked_titles JSONB DEFAULT '{"prefixes": ["名もなき"], "suffixes": ["旅人"]}'::jsonb,
            ADD COLUMN IF NOT EXISTS active_title JSONB DEFAULT '{"prefix": "名もなき", "suffix": "旅人"}'::jsonb;
        `))
        .then(() => pool.query(`
            ALTER TABLE planets
            ADD COLUMN IF NOT EXISTS random_key DOUBLE PRECISION;
            ALTER TABLE planets
            ALTER COLUMN random_key SET DEFAULT random();
            UPDATE planets SET random_key = random() WHERE random_key IS NULL;
            ALTER TABLE planets
            ALTER COLUMN random_key SET NOT NULL;
        `))
        .then(() => pool.query(`CREATE INDEX IF NOT EXISTS idx_planets_username ON planets(username);`))
        .then(() => pool.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_planets_username_lower ON planets (LOWER(username));`))
        .then(() => pool.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_planets_random_key ON planets (random_key);`))
        .then(() => {
            console.log('[DB] カラムとインデックスの準備ができました');
            return true;
        })
        .catch((error) => {
            console.error('[DB] テーブル作成/接続に失敗しました (ローカルDBが起動していない可能性があります):', error.message);
            // 起動成功として隠すと、障害が最初のDB操作まで遅延するため、Cloud Runに異常を検知させる。
            throw error;
        });
}
