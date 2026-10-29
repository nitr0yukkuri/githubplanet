import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runDatabaseMigrations } from '../src/infrastructure/database/migrations.js';
import { createGithubPublicQuotaStore } from '../src/infrastructure/database/github-public-quota-store.js';

test('PostgreSQL shares the public budget atomically and releases cooldown at the upstream reset', {
    skip: !process.env.TEST_DATABASE_URL, timeout: 60000
}, async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    assert.equal(url.pathname, '/githubplanet_e2e');
    const pool = new pg.Pool({ connectionString: url.href, max: 5 });
    const key = `quota-fixture:${crypto.randomUUID()}`;
    try {
        await runDatabaseMigrations(pool, { logger: { log() {}, warn() {} } });
        const store = createGithubPublicQuotaStore(pool);
        const reservations = await Promise.all(Array.from({ length: 12 }, () => store.reserve(key, 3, 3600000)));
        assert.equal(reservations.filter((result) => result.allowed).length, 3);
        const until = Date.now() + 2000;
        await store.block(key, until);
        const blocked = await store.reserve(key, 3, 3600000);
        assert.equal(blocked.allowed, false);
        assert.ok(blocked.retryAfterMs >= 1000 && blocked.retryAfterMs < 5000, 'cooldown must not add another hour');
        await pool.query(`UPDATE github_profile_lookup_quota SET blocked_until=NOW()-INTERVAL '1 second',
            window_started_at=NOW()-INTERVAL '1 second' WHERE quota_key=$1`, [key]);
        assert.equal((await store.reserve(key, 3, 3600000)).allowed, true);
    } finally {
        await pool.query('DELETE FROM github_profile_lookup_quota WHERE quota_key=$1', [key]).catch(() => {});
        await pool.end();
    }
});
