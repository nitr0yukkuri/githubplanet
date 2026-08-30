import 'dotenv/config';
import { runDatabaseMigrations } from '../src/infrastructure/database/migrations.js';
import { createPostgresPool } from '../src/infrastructure/database/postgres.js';

const pool = createPostgresPool(process.env.DATABASE_URL, {
    max: 1,
    queryTimeout: 0,
    statementTimeout: 0
});

if (!pool) {
    console.error('[DB] DATABASE_URLが設定されていません');
    process.exitCode = 1;
} else {
    try {
        await runDatabaseMigrations(pool);
    } catch (error) {
        console.error(`[DB] migrationに失敗しました: ${error.message}`);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}
