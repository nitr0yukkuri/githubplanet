import 'dotenv/config';
import { createPostgresPool } from '../src/infrastructure/database/postgres.js';
import { safeErrorMetadata } from '../src/shared/error-metadata.js';

let pool, client;
try {
    pool = createPostgresPool(process.env.DATABASE_URL, { max: 1, queryTimeout: 5000, statementTimeout: 5000 });
    if (!pool) throw new Error('DATABASE_URL is required');
    client = await pool.connect();
    const usesTls = Boolean(client.connectionParameters.ssl);
    if (usesTls && client.connection.stream.authorized !== true) throw new Error('PostgreSQL certificate was not verified');
    await client.query('SELECT 1');
    console.log(usesTls ? '[DB preflight] TLS certificate and connection verified' : '[DB preflight] Local connection verified');
} catch (error) {
    console.error('[DB preflight] Connection failed; check DATABASE_URL, CA and credentials:', safeErrorMetadata(error));
    process.exitCode = 1;
} finally {
    client?.release();
    await pool?.end();
}
