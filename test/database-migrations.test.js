import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    assertDatabaseMigrationsApplied,
    loadDatabaseMigrations,
    runDatabaseMigrations
} from '../src/infrastructure/database/migrations.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class FakeMigrationClient {
    constructor({ failInitialSchema = false, indexes = {} } = {}) {
        this.appliedMigrations = new Map();
        this.failInitialSchema = failInitialSchema;
        this.indexes = new Map(Object.entries(indexes));
        this.inTransaction = false;
        this.queries = [];
        this.releaseCount = 0;
    }

    async query(sql, parameters = []) {
        const normalized = sql.trim();
        this.queries.push({ sql: normalized, parameters, inTransaction: this.inTransaction });

        if (normalized === 'BEGIN') {
            this.inTransaction = true;
            return { rows: [] };
        }
        if (normalized === 'COMMIT' || normalized === 'ROLLBACK') {
            this.inTransaction = false;
            return { rows: [] };
        }
        if (normalized.includes('FROM schema_migrations')) {
            return {
                rows: [...this.appliedMigrations].map(([version, checksum]) => ({ version, checksum }))
            };
        }
        if (normalized.includes('FROM pg_index')) {
            const state = this.indexes.get(parameters[0]);
            return { rows: state === undefined ? [] : [{ is_valid: state }] };
        }
        if (normalized.startsWith('DROP INDEX CONCURRENTLY')) {
            const indexName = normalized.match(/"([^"]+)"$/)?.[1];
            this.indexes.delete(indexName);
            return { rows: [] };
        }
        if (normalized.includes('CREATE INDEX CONCURRENTLY')) {
            assert.equal(this.inTransaction, false, 'CONCURRENTLY must run outside a transaction');
            const indexName = normalized.match(/EXISTS\s+([a-z0-9_]+)/i)?.[1];
            this.indexes.set(indexName, true);
            return { rows: [] };
        }
        if (normalized.includes('INSERT INTO schema_migrations')) {
            this.appliedMigrations.set(parameters[0], parameters[2]);
            return { rows: [] };
        }
        if (this.failInitialSchema && normalized.includes('CREATE TABLE IF NOT EXISTS planets')) {
            throw new Error('schema update failed');
        }

        return { rows: [] };
    }

    release() {
        this.releaseCount += 1;
    }
}

function createFakePool(client) {
    return {
        async connect() {
            return client;
        },
        query(sql, parameters) {
            return client.query(sql, parameters);
        }
    };
}

test('loads ordered immutable migrations and keeps concurrent indexes outside transactions', () => {
    const migrations = loadDatabaseMigrations();

    assert.deepEqual(migrations.map(({ version }) => version), ['001', '002', '003']);
    assert.equal(migrations[0].transactional, true);
    assert.equal(migrations[1].transactional, false);
    assert.equal(migrations[1].verifiedIndex, 'idx_planets_username_lower');
    assert.equal(migrations[2].verifiedIndex, 'idx_planets_random_key');
    assert.match(migrations[0].sql, /CREATE TABLE IF NOT EXISTS "session"/);
    assert.match(migrations[0].sql, /CREATE TABLE IF NOT EXISTS language_color_cache/);
    assert.match(migrations[0].sql, /UPDATE planets SET random_key = random\(\)/);
});

test('keeps migration checksums stable across operating-system line endings', () => {
    const lfDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'githubplanet-migration-lf-'));
    const crlfDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'githubplanet-migration-crlf-'));

    try {
        fs.writeFileSync(path.join(lfDirectory, '001_test.sql'), 'SELECT 1;\n');
        fs.writeFileSync(path.join(crlfDirectory, '001_test.sql'), 'SELECT 1;\r\n');

        assert.equal(
            loadDatabaseMigrations(lfDirectory)[0].checksum,
            loadDatabaseMigrations(crlfDirectory)[0].checksum
        );
    } finally {
        fs.rmSync(lfDirectory, { recursive: true, force: true });
        fs.rmSync(crlfDirectory, { recursive: true, force: true });
    }
});

test('applies each migration once under a lock and repairs an invalid concurrent index', async () => {
    const client = new FakeMigrationClient({
        indexes: { idx_planets_username_lower: false }
    });
    const pool = createFakePool(client);

    const firstAppliedVersions = await runDatabaseMigrations(pool, {
        logger: { log() {}, warn() {} }
    });
    const migrationQueryCount = client.queries.filter(({ sql }) => (
        sql.includes('CREATE TABLE IF NOT EXISTS planets')
        || sql.includes('CREATE INDEX CONCURRENTLY')
    )).length;

    assert.deepEqual(firstAppliedVersions, ['001', '002', '003']);
    assert.equal(client.appliedMigrations.size, 3);
    assert.ok(client.queries.some(({ sql }) => (
        sql === 'DROP INDEX CONCURRENTLY IF EXISTS "idx_planets_username_lower"'
    )));
    assert.equal(await assertDatabaseMigrationsApplied(pool), true);

    await runDatabaseMigrations(pool, { logger: { log() {}, warn() {} } });
    assert.equal(client.queries.filter(({ sql }) => (
        sql.includes('CREATE TABLE IF NOT EXISTS planets')
        || sql.includes('CREATE INDEX CONCURRENTLY')
    )).length, migrationQueryCount);
    assert.equal(client.queries.filter(({ sql }) => sql.includes('pg_advisory_lock')).length, 2);
    assert.equal(client.queries.filter(({ sql }) => sql.includes('pg_advisory_unlock')).length, 2);
    assert.equal(client.releaseCount, 2);
});

test('rolls back a failed transactional migration and always releases its lock and client', async () => {
    const client = new FakeMigrationClient({ failInitialSchema: true });

    await assert.rejects(
        () => runDatabaseMigrations(createFakePool(client), {
            logger: { log() {}, warn() {} }
        }),
        /schema update failed/
    );

    assert.ok(client.queries.some(({ sql }) => sql === 'ROLLBACK'));
    assert.ok(client.queries.some(({ sql }) => sql.includes('pg_advisory_unlock')));
    assert.equal(client.appliedMigrations.size, 0);
    assert.equal(client.releaseCount, 1);
});

test('fails read-only startup verification with an actionable message when migrations are missing', async () => {
    const missingTableError = new Error('relation does not exist');
    missingTableError.code = '42P01';
    const pool = {
        async query() {
            throw missingTableError;
        }
    };

    await assert.rejects(
        () => assertDatabaseMigrationsApplied(pool),
        /先に npm run migrate を実行してください/
    );
});

test('keeps the HTTP server startup free from schema mutations', () => {
    const serverSource = fs.readFileSync(path.join(projectRoot, 'server.js'), 'utf8');

    assert.match(serverSource, /assertDatabaseMigrationsApplied\(pool\)/);
    assert.doesNotMatch(serverSource, /prepareDatabase|runDatabaseMigrations/);
});

test('starts the Docker application only after its migration service succeeds', () => {
    const composeSource = fs.readFileSync(path.join(projectRoot, 'docker-compose.yml'), 'utf8');

    assert.match(composeSource, /app:[\s\S]*?depends_on:\s+\s*migrate:\s+\s*condition: service_completed_successfully/);
    assert.match(composeSource, /migrate:[\s\S]*?depends_on:\s+\s*db:\s+\s*condition: service_healthy/);
    assert.match(composeSource, /command: npm run migrate/);
});
