import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MIGRATIONS_DIRECTORY = fileURLToPath(
    new URL('../../../migrations/', import.meta.url)
);
const MIGRATION_FILE_PATTERN = /^(\d{3})_([a-z0-9_-]+)\.sql$/i;
const NO_TRANSACTION_DIRECTIVE = /^\s*--\s*migrate:no-transaction\s*$/m;
const VERIFY_INDEX_DIRECTIVE = /^\s*--\s*migrate:verify-index=([a-z_][a-z0-9_]*)\s*$/mi;
const MIGRATION_LOCK_NAME = 'githubplanet_schema_migrations';

function checksum(source) {
    const platformIndependentSource = source.replace(/\r\n?/g, '\n');
    return crypto.createHash('sha256').update(platformIndependentSource).digest('hex');
}

function quoteIdentifier(identifier) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
        throw new Error(`不正なPostgreSQL識別子です: ${identifier}`);
    }
    return `"${identifier.replaceAll('"', '""')}"`;
}

function createMigrationRequiredError(reason) {
    const error = new Error(`[DB] ${reason}。先に npm run migrate を実行してください。`);
    error.code = 'DATABASE_MIGRATION_REQUIRED';
    return error;
}

export function loadDatabaseMigrations(directory = DEFAULT_MIGRATIONS_DIRECTORY) {
    const sqlFileNames = fs.readdirSync(directory)
        .filter((fileName) => fileName.toLowerCase().endsWith('.sql'));
    const invalidFileName = sqlFileNames.find((fileName) => !MIGRATION_FILE_PATTERN.test(fileName));
    if (invalidFileName) {
        throw new Error(`migrationファイル名は3桁の連番にしてください: ${invalidFileName}`);
    }
    if (sqlFileNames.length === 0) {
        throw new Error(`migrationファイルがありません: ${directory}`);
    }

    const migrations = sqlFileNames
        .sort((left, right) => left.localeCompare(right, 'en'))
        .map((fileName) => {
            const [, version, name] = fileName.match(MIGRATION_FILE_PATTERN);
            const sql = fs.readFileSync(path.join(directory, fileName), 'utf8');
            const transactional = !NO_TRANSACTION_DIRECTIVE.test(sql);
            const verifiedIndex = sql.match(VERIFY_INDEX_DIRECTIVE)?.[1];

            if (!transactional && !verifiedIndex) {
                throw new Error(`${fileName}: transaction外migrationには検証対象indexが必要です`);
            }

            return {
                version,
                name,
                fileName,
                sql,
                checksum: checksum(sql),
                transactional,
                verifiedIndex
            };
        });

    const versions = new Set();
    for (const migration of migrations) {
        if (versions.has(migration.version)) {
            throw new Error(`migration versionが重複しています: ${migration.version}`);
        }
        versions.add(migration.version);
    }

    return migrations;
}

async function readAppliedMigrations(queryable) {
    const result = await queryable.query(`
        SELECT version, checksum
        FROM schema_migrations
        ORDER BY version
    `);
    return new Map(result.rows.map((row) => [row.version, row.checksum]));
}

function validateKnownChecksums(migrations, appliedMigrations) {
    for (const migration of migrations) {
        const appliedChecksum = appliedMigrations.get(migration.version);
        if (appliedChecksum && appliedChecksum !== migration.checksum) {
            throw new Error(
                `[DB] 適用済みmigration ${migration.version} の内容が変更されています`
            );
        }
    }
}

async function readIndexState(client, indexName) {
    const result = await client.query(`
        SELECT pg_index.indisvalid AS is_valid
        FROM pg_index
        JOIN pg_class ON pg_class.oid = pg_index.indexrelid
        JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
        WHERE pg_class.relname = $1
          AND pg_namespace.nspname = current_schema()
    `, [indexName]);
    return result.rows[0];
}

async function applyConcurrentIndexMigration(client, migration) {
    const indexState = await readIndexState(client, migration.verifiedIndex);
    if (indexState && !indexState.is_valid) {
        // 失敗したCONCURRENTLYが無効indexを残すと再試行できないため、再作成前に除去する。
        await client.query(
            `DROP INDEX CONCURRENTLY IF EXISTS ${quoteIdentifier(migration.verifiedIndex)}`
        );
    }

    await client.query(migration.sql);

    const updatedIndexState = await readIndexState(client, migration.verifiedIndex);
    if (!updatedIndexState?.is_valid) {
        throw new Error(
            `[DB] migration ${migration.version} のindex ${migration.verifiedIndex} が有効になっていません`
        );
    }
}

async function recordMigration(client, migration) {
    await client.query(`
        INSERT INTO schema_migrations (version, name, checksum)
        VALUES ($1, $2, $3)
    `, [migration.version, migration.name, migration.checksum]);
}

async function applyTransactionalMigration(client, migration) {
    await client.query('BEGIN');
    try {
        await client.query(migration.sql);
        await recordMigration(client, migration);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    }
}

export async function runDatabaseMigrations(pool, {
    directory = DEFAULT_MIGRATIONS_DIRECTORY,
    logger = console
} = {}) {
    if (!pool) {
        throw new Error('[DB] DATABASE_URLが設定されていないためmigrationを実行できません');
    }

    const migrations = loadDatabaseMigrations(directory);
    const client = await pool.connect();
    let lockAcquired = false;

    try {
        // デプロイが重なっても二重適用しないよう、同じ専用接続のsession lockで直列化する。
        await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_NAME]);
        lockAcquired = true;
        await client.query('SET statement_timeout = 0');
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                checksum TEXT NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        const appliedMigrations = await readAppliedMigrations(client);
        validateKnownChecksums(migrations, appliedMigrations);

        for (const migration of migrations) {
            if (appliedMigrations.has(migration.version)) continue;

            logger.log(`[DB] migration ${migration.version}_${migration.name} を適用します`);
            if (migration.transactional) {
                await applyTransactionalMigration(client, migration);
            } else {
                await applyConcurrentIndexMigration(client, migration);
                await recordMigration(client, migration);
            }
            appliedMigrations.set(migration.version, migration.checksum);
        }

        logger.log('[DB] migrationは最新です');
        return migrations.map(({ version }) => version);
    } finally {
        if (lockAcquired) {
            await client.query(
                'SELECT pg_advisory_unlock(hashtext($1))',
                [MIGRATION_LOCK_NAME]
            ).catch((error) => logger.warn(`[DB] migration lockの解放に失敗しました: ${error.message}`));
        }
        client.release();
    }
}

export async function assertDatabaseMigrationsApplied(pool, {
    directory = DEFAULT_MIGRATIONS_DIRECTORY
} = {}) {
    if (!pool) {
        console.warn('[DB] データベース接続文字列(DATABASE_URL)が設定されていません。DB機能は無効になります。');
        return false;
    }

    const migrations = loadDatabaseMigrations(directory);
    let appliedMigrations;
    try {
        appliedMigrations = await readAppliedMigrations(pool);
    } catch (error) {
        if (error.code === '42P01') {
            throw createMigrationRequiredError('migration管理テーブルがありません');
        }
        throw error;
    }

    validateKnownChecksums(migrations, appliedMigrations);
    const missingVersions = migrations
        .filter(({ version }) => !appliedMigrations.has(version))
        .map(({ version }) => version);

    if (missingVersions.length > 0) {
        throw createMigrationRequiredError(
            `未適用のmigrationがあります: ${missingVersions.join(', ')}`
        );
    }

    return true;
}
