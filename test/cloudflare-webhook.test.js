import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { receiveWebhook } from '../cloudflare/webhook.js';
import { buildWebhookMeteors } from '../src/domain/meteor/webhook-meteors.js';
import { EXTENSION_MAP } from '../src/domain/planet/language-extensions.js';
const env = { GITHUB_WEBHOOK_SECRET: 'test-secret' };
const deliveryId = '11111111-1111-1111-1111-111111111111';
function request(text, options = {}) {
    const bytes = new TextEncoder().encode(text);
    let position = 0;
    const stream = new ReadableStream({ pull(controller) {
        if (position === bytes.length) return controller.close();
        const end = Math.min(position + 7, bytes.length);
        controller.enqueue(bytes.slice(position, end)); position = end;
    } });
    return new Request('https://example.com/webhook', { method: 'POST', body: stream, duplex: 'half',
        headers: { 'content-type': 'application/json', 'x-github-delivery': deliveryId,
            'x-hub-signature-256': 'sha256=' + createHmac('sha256', env.GITHUB_WEBHOOK_SECRET).update(text).digest('hex'), ...options } });
}
test('streamed webhook preserves language precedence and scale across split Unicode tokens', async () => {
    const payload = { commits: [{ message: '日本語 🌊'.repeat(10000), modified: ['a.js'], added: ['foo.unknown', 'lib.rb'], id: 'a', total_lines: 100 }, { id: 'b', modified: ['a.go','x.txt'] }, { id: 'c', added: ['unknown'] }], repository: { language: 'Elm' } };
    let actual;
    const response = await receiveWebhook(request(JSON.stringify(payload)), env, { async enqueueWebhookInputs(inputs, metadata) { actual = inputs; assert.equal(metadata.deliveryId, deliveryId); assert.match(metadata.payloadHash, /^[a-f0-9]{64}$/); } });
    assert.equal(response.status, 200);
    assert.deepEqual(actual, buildWebhookMeteors(payload, EXTENSION_MAP));
});
test('signature rejection and invalid JSON never enqueue, persistence failure remains retryable', async () => {
    let count = 0; const dispatch = { async enqueueWebhookInputs() { count++; throw new Error('Queue unavailable'); } };
    const body = JSON.stringify({ repository: { language: 'Ruby' }, commits: [{ id: 'abc', added: ['a.rb'] }] });
    assert.equal((await receiveWebhook(request(body, { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) }), env, dispatch)).status, 401);
    assert.equal((await receiveWebhook(request('{'), env, dispatch)).status, 400);
    assert.equal(count, 0);
    assert.equal((await receiveWebhook(request(body), env, dispatch)).status, 503);
    assert.equal(count, 1);
});
