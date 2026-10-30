import assert from 'node:assert/strict';
import test from 'node:test';
import { createWebhookDeliveryStore } from '../src/infrastructure/database/webhook-delivery-store.js';

const id = '123e4567-e89b-12d3-a456-426614174000';
test('rolls back the receipt when job persistence fails and always releases the connection', async () => {
    const calls = [], failure = new Error('job insert failed');
    const store = createWebhookDeliveryStore({ async connect() { return {
        async query(sql) {
            calls.push(sql.trim());
            if (sql.includes('INSERT INTO github_webhook_jobs')) throw failure;
            return { rowCount: 1, rows: [] };
        }, release() { calls.push('release'); }
    }; } });
    await assert.rejects(store.enqueue(id, 'a'.repeat(64), { repository: {}, commits: [{ id: 'one' }] }), (error) => error === failure);
    assert.equal(calls[0], 'BEGIN');
    assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'release']);
    assert.equal(calls.includes('COMMIT'), false);
});

test('rejects invalid delivery IDs and hashes before acquiring a database connection', async () => {
    const store = createWebhookDeliveryStore({ connect() { assert.fail('must not touch DB'); } });
    await assert.rejects(store.enqueue('../invalid', 'a'.repeat(64), {}), /Invalid GitHub webhook delivery ID/);
    await assert.rejects(store.enqueue(id, 'invalid', {}), /Invalid GitHub webhook payload hash/);
});
