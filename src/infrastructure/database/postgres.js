import fs from 'node:fs';
import pg from 'pg';
import { safeErrorMetadata } from '../../shared/error-metadata.js';

const POSTGRES_TLS_PARAMETERS = new Set([
    'ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'
]);

function preparePostgresConnection(connectionUrl, isLocalDatabase) {
    const tlsOptions = isLocalDatabase ? false : { rejectUnauthorized: true };
    const queryParameters = [...connectionUrl.searchParams.entries()];

    for (const parameterName of POSTGRES_TLS_PARAMETERS) {
        const matchingEntries = queryParameters.filter(([key]) => key.toLowerCase() === parameterName);
        const value = matchingEntries.at(-1)?.[1] || null;

        if (tlsOptions && value && ['sslcert', 'sslkey', 'sslrootcert'].includes(parameterName)) {
            const contents = fs.readFileSync(value, 'utf8');
            if (parameterName === 'sslcert') tlsOptions.cert = contents;
            if (parameterName === 'sslkey') tlsOptions.key = contents;
            if (parameterName === 'sslrootcert') tlsOptions.ca = contents;
        }

        for (const [matchingKey] of matchingEntries) connectionUrl.searchParams.delete(matchingKey);
    }

    return { connectionString: connectionUrl.toString(), ssl: tlsOptions };
}

export function createPostgresPool(connectionString, {
    max = 5,
    queryTimeout = 15000,
    statementTimeout = 15000
} = {}) {
    if (!connectionString) return undefined;
    let connectionUrl;
    try {
        connectionUrl = new URL(connectionString);
    } catch {
        throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
    }
    if (!['postgres:', 'postgresql:'].includes(connectionUrl.protocol)) {
        throw new Error('DATABASE_URL must use the PostgreSQL protocol');
    }
    const databaseHost = connectionUrl.hostname.toLowerCase();
    const isLocalDatabase = ['localhost', '127.0.0.1', '[::1]', 'db'].includes(databaseHost);
    const preparedConnection = preparePostgresConnection(connectionUrl, isLocalDatabase);

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
