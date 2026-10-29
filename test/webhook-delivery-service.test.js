import assert from 'node:assert/strict';
import test from 'node:test';
import { createWebhookDeliveryService } from '../src/application/webhook-delivery-service.js';
import { createMemoryWebhookStore } from './fixtures/webhook-store.js';

const payload = { repository: { language: 'JavaScript', secret: 'must not persist' },
    commits: [{ id: 'one', modified: ['a.js'], message: 'private text' }, { id: 'two', added: ['b.js'] }], token: 'not persisted' };
const logger = { warn() {} };

test('durably accepts without doing color or notification work and ignores duplicate deliveries', async () => {
    const store = createMemoryWebhookStore();
    const service = createWebhookDeliveryService({ store, meteorService: { processWebhook() { assert.fail(); } } });
    assert.equal(await service.accept('id-one', 'hash', payload), true);
    assert.equal(await service.accept('id-two', 'hash', payload), false);
    assert.equal(store.jobs.length, 2);
    assert.equal(JSON.stringify(store.jobs).includes('private text'), false);
    assert.equal(JSON.stringify(store.jobs).includes('must not persist'), false);
    assert.equal(JSON.stringify(store.jobs).includes('not persisted'), false);
});

test('retries failed work after restarting the service without repeating completed commits', async () => {
    let time = 0;
    const store = createMemoryWebhookStore({ now: () => time });
    const processed = [];
    const first = createWebhookDeliveryService({ store, logger, meteorService: { async processWebhook(data) {
        if (data.commits[0].id === 'two') throw new Error('temporary failure');
        processed.push('one');
    } } });
    await first.accept('id', 'hash', payload);
    assert.equal(await first.processPending(), 1);
    assert.equal(store.jobs[1].completed, undefined);
    time = 2001;
    const restarted = createWebhookDeliveryService({ store, logger, meteorService: { async processWebhook(data, { eventKey }) {
        processed.push(data.commits[0].id); assert.match(eventKey, /^github-webhook:/);
    } } });
    assert.equal(await restarted.processPending(), 1);
    assert.deepEqual(processed, ['one', 'two']);
});

test('expired leases can be reclaimed and a stale worker cannot complete another claim', async () => {
    let time = 0;
    const store = createMemoryWebhookStore({ now: () => time });
    await store.enqueue('id', 'hash', { repository: {}, commits: [{}] });
    const abandoned = await store.claimPending('first');
    assert.equal(await store.claimPending('second'), null);
    time = 300001;
    const replacement = await store.claimPending('second');
    assert.equal(await store.complete(abandoned), false);
    assert.equal(await store.complete(replacement), true);
});
