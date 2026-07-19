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
});
