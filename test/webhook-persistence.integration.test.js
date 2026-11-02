import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runDatabaseMigrations } from '../src/infrastructure/database/migrations.js';
import { createWebhookDeliveryStore } from '../src/infrastructure/database/webhook-delivery-store.js';

test('PostgreSQL atomically enqueues, leases, retries and fences webhook jobs', {
    skip: !process.env.TEST_DATABASE_URL, timeout: 60000
}, async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    assert.equal(url.pathname, '/githubplanet_e2e', 'only the disposable E2E database is allowed');
    const pool = new pg.Pool({ connectionString: url.href, max: 4 });
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const hash = crypto.createHash('sha256').update(ids[0]).digest('hex');
    const payload = { repository: { language: 'JavaScript' }, commits: [{ id: 'one' }, { id: 'two' }] };
    try {
        await runDatabaseMigrations(pool, { logger: { log() {}, warn() {} } });
        const store = createWebhookDeliveryStore(pool);
        const accepted = await Promise.all([
            store.enqueue(ids[0], hash, payload), store.enqueue(ids[1], hash, payload)
        ]);
        assert.equal(accepted.filter(Boolean).length, 1);
        const jobs = await pool.query('SELECT id FROM github_webhook_jobs WHERE delivery_id = ANY($1::uuid[])', [ids]);
        assert.equal(jobs.rowCount, 2);
        const claims = await Promise.all([store.claimPending(crypto.randomUUID()), store.claimPending(crypto.randomUUID())]);
        assert.equal(new Set(claims.map((job) => job.id)).size, 2);
        assert.equal(await store.claimPending(crypto.randomUUID()), null);
        await store.retry(claims[0], 'ETIMEDOUT', 1000);
        assert.equal(await store.claimPending(crypto.randomUUID()), null);
        await pool.query('UPDATE github_webhook_jobs SET available_at = NOW() - INTERVAL \'1 second\' WHERE id = $1', [claims[0].id]);
        const recovered = await store.claimPending(crypto.randomUUID());
        assert.equal(recovered.id, claims[0].id);
        assert.equal(await store.complete(claims[0]), false, 'old lease cannot complete recovered work');
        assert.equal(await store.complete(recovered), true);
        await pool.query('UPDATE github_webhook_jobs SET lease_until = NOW() - INTERVAL \'1 second\' WHERE id = $1', [claims[1].id]);
        const expired = await store.claimPending(crypto.randomUUID());
        assert.equal(expired.id, claims[1].id);
        await store.complete(expired);

        const failed = createWebhookDeliveryStore({ async connect() {
            const client = await pool.connect();
            return { release: () => client.release(), query: (sql, args) => {
                if (sql.includes('INSERT INTO github_webhook_jobs')) throw new Error('injected insert failure');
                return client.query(sql, args);
            } };
        } });
        await assert.rejects(failed.enqueue(ids[2], 'f'.repeat(64), payload), /injected insert failure/);
        assert.equal((await pool.query('SELECT delivery_id FROM github_webhook_deliveries WHERE delivery_id=$1', [ids[2]])).rowCount, 0);
    } finally {
        await pool.query('DELETE FROM github_webhook_deliveries WHERE delivery_id = ANY($1::uuid[])', [ids]).catch(() => {});
        await pool.end();
    }
});
