import pg from 'pg';

export function createPostgresPool(connectionString, {
    max = 5,
    queryTimeout = 15000,
    statementTimeout = 15000
} = {}) {
    if (!connectionString) return undefined;
    const isLocalDatabase = connectionString.includes('@localhost')
        || connectionString.includes('@127.0.0.1')
        || connectionString.includes('@db')
        || connectionString.includes('localhost');

    const pool = new pg.Pool({
        connectionString,
        ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
        max,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 60000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        query_timeout: queryTimeout,
        statement_timeout: statementTimeout
    });

    pool.on('error', (error) => {
        console.error(`[DB] Idle client connection error: ${error.message}`);
    });

    return pool;
}
