import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareDatabase } from '../src/infrastructure/database/postgres.js';

test('prepares the session table before the server accepts requests', async () => {
    const queries = [];
    const pool = {
        async query(sql) {
            queries.push(sql);
            return { rows: [] };
        }
    };

    await prepareDatabase(pool);

    const sessionQuery = queries.find((sql) => sql.includes('CREATE TABLE IF NOT EXISTS "session"'));
    assert.ok(sessionQuery);
    assert.match(sessionQuery, /CREATE INDEX IF NOT EXISTS "IDX_session_expire"/);
    assert.ok(queries.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS language_color_cache')));
    assert.ok(queries.some((sql) => sql.includes('ADD COLUMN IF NOT EXISTS random_key DOUBLE PRECISION')));
    assert.ok(queries.some((sql) => sql.includes('ALTER COLUMN random_key SET DEFAULT random()')));
    assert.ok(queries.some((sql) => sql.includes('UPDATE planets SET random_key = random() WHERE random_key IS NULL')));
    assert.ok(queries.some((sql) => sql.includes('ALTER COLUMN random_key SET NOT NULL')));
    assert.ok(queries.some((sql) => sql.includes('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_planets_username_lower')));
    assert.ok(queries.some((sql) => sql.includes('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_planets_random_key')));
});

test('fails startup preparation when a database query fails', async () => {
    const pool = {
        async query() {
            throw new Error('database unavailable');
        }
    };

    await assert.rejects(
        () => prepareDatabase(pool),
        /database unavailable/
    );
});
