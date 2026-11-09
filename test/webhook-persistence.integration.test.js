import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runDatabaseMigrations } from '../src/infrastructure/database/migrations.js';
import { createWebhookDeliveryStore } from '../src/infrastructure/database/webhook-delivery-store.js';
import { createMeteorEventStore } from '../src/infrastructure/database/meteor-event-store.js';

test('PostgreSQL meteor stream deduplicates jobs and serializes sequence allocation with commits', {
    skip: !process.env.TEST_DATABASE_URL, timeout: 60000
}, async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    assert.equal(url.pathname, '/githubplanet_e2e');
    const pool = new pg.Pool({ connectionString: url.href, max: 4 });
    const keys = [crypto.randomUUID(), crypto.randomUUID()];
    let transaction, second;
    try {
        await runDatabaseMigrations(pool, { logger: { log() {}, warn() {} } });
        const store = createMeteorEventStore(pool), cursor = await store.latestId();
        transaction = await pool.connect();
        await transaction.query('BEGIN');
        const firstStore = createMeteorEventStore({ query: (...args) => transaction.query(...args) });
        const payload = { color: '#007acc', language: 'TypeScript', scale: 1 };
        const firstId = await firstStore.append(keys[0], payload);
        let secondCommitted = false;
        second = store.append(keys[1], payload).then((id) => { secondCommitted = true; return id; });
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(secondCommitted, false, 'second writer cannot commit past an uncommitted event');
        assert.deepEqual(await store.readAfter(cursor), []);
        await transaction.query('COMMIT');
        const secondId = await second;
        assert.ok(BigInt(firstId) < BigInt(secondId));
        assert.equal(await store.append(keys[0], payload), null, 'retry does not add another event');
        const events = await store.readAfter(cursor);
        assert.deepEqual(events.map((event) => event.id), [firstId, secondId]);
    } finally {
        if (transaction) { await transaction.query('ROLLBACK').catch(() => {}); transaction.release(); }
        await second?.catch(() => {});
        await pool.query('DELETE FROM meteor_events WHERE event_key = ANY($1::text[])', [keys]).catch(() => {});
        await pool.end();
    }
});

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
