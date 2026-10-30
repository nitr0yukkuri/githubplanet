import pg from 'pg';
import { parse as parsePostgresConnectionString } from 'pg-connection-string';
import { safeErrorMetadata } from '../../shared/error-metadata.js';

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);

function preparePostgresConnection(connectionString) {
    if (!connectionString.startsWith('/')
        && !/^postgres(?:ql)?:\/\//i.test(connectionString)) {
        throw new Error('DATABASE_URL must use a PostgreSQL URL or local socket path');
    }

    const connectionOptions = parsePostgresConnectionString(connectionString);
    const databaseHost = String(connectionOptions.host || 'localhost').toLowerCase();
    const isLocalDatabase = LOCAL_DATABASE_HOSTS.has(databaseHost) || databaseHost.startsWith('/');
    const configuredSsl = connectionOptions.ssl && typeof connectionOptions.ssl === 'object'
        ? connectionOptions.ssl
        : {};
    const safeConfiguredSsl = { ...configuredSsl };
    // libpq's verify-ca mode disables hostname matching, which is weaker than this policy.
    delete safeConfiguredSsl.checkServerIdentity;

    // pg parses SSL query parameters after Pool options, so pass parsed fields without the URL.
    return {
        ...connectionOptions,
        ssl: isLocalDatabase ? false : { ...safeConfiguredSsl, rejectUnauthorized: true }
    };
}

export function createPostgresPool(connectionString, {
    max = 5,
    queryTimeout = 15000,
    statementTimeout = 15000
} = {}) {
    if (!connectionString) return undefined;
    const preparedConnection = preparePostgresConnection(connectionString);

    const pool = new pg.Pool({
        ...preparedConnection,
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
