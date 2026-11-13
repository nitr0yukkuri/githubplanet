import pg from 'pg';

export function createWorkerPool(env, { queryTimeoutMs = 15_000 } = {}) {
    const connectionString = env.POSTGRES?.connectionString;
    if (!connectionString) {
        if (env.NODE_ENV === 'production') throw new Error('POSTGRES Hyperdrive binding is required');
        return undefined;
    }
    // 接続を別リクエストから再利用せず、実接続の共有はHyperdriveに任せる。
    const pool = new pg.Pool({
        connectionString, max: 3, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 1000,
        // 接続済みDBが応答しない場合も、HTTPやQueueを無期限に待たせない。
        query_timeout: queryTimeoutMs
    });
    pool.on('error', (error) => console.error('[Cloudflare PostgreSQL]', { name: error.name, code: error.code }));
    return pool;
}

export async function readScanIdentity(pool, githubId) {
    const result = await pool.query(
        "SELECT sess FROM session WHERE expire > NOW() AND sess->'planetData'->'user'->>'id' = $1 ORDER BY expire DESC LIMIT 1",
        [String(githubId)]
    );
    const session = result.rows[0]?.sess;
    const user = session?.planetData?.user;
    if (!user || String(user.id) !== String(githubId) || !session.github_token) return null;
    // キューにはアクセストークンを保存せず、処理時に有効な本人セッションから取り出す。
    return { githubId: user.id, login: user.login, accountCreatedAt: user.created_at, accessToken: session.github_token };
}
