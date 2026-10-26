import pg from 'pg';
import { safeErrorMetadata } from '../../shared/error-metadata.js';

export function createPostgresPool(connectionString, {
    max = 5,
    queryTimeout = 15000,
    statementTimeout = 15000
} = {}) {
    if (!connectionString) return undefined;
    let databaseHost = '';
    try {
        databaseHost = new URL(connectionString).hostname.toLowerCase();
    } catch {
        // 不正な接続文字列でも、リモートTLS検証を無効化しない。
    }
    const isLocalDatabase = ['localhost', '127.0.0.1', '[::1]', 'db'].includes(databaseHost);

    const pool = new pg.Pool({
        connectionString,
        ssl: isLocalDatabase ? undefined : { rejectUnauthorized: true },
        max,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 60000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        query_timeout: queryTimeout,
        statement_timeout: statementTimeout
    });

    pool.on('error', (error) => {
        console.error('[DB] Idle client connection error:', safeErrorMetadata(error));
    });

    return pool;
}
