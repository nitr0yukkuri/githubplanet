import assert from 'node:assert/strict';
import test from 'node:test';
import { createWebhookWorker } from '../src/infrastructure/realtime/webhook-worker.js';

test('does not poll the DB without viewers but accepts an explicit request kick', async () => {
    let calls = 0;
    const worker = createWebhookWorker({ intervalMs: 5, isActive: () => false,
        service: { async processPending() { calls++; }, async cleanup() {} } });
    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(calls, 0);
    worker.kick();
    await worker.stop();
    assert.equal(calls, 1);
});

test('coalesces kicks, retries a failed poll and stops with in-flight processing finished', async () => {
    let release, calls = 0, active = 0, maxActive = 0;
    const worker = createWebhookWorker({ intervalMs: 5, logger: { warn() {} }, service: {
        async processPending() {
            calls++; active++; maxActive = Math.max(maxActive, active);
            try {
                if (calls === 1) await new Promise((resolve) => { release = resolve; });
                if (calls === 2) throw new Error('DB unavailable');
            } finally { active--; }
        }, async cleanup() {}
    } });
    worker.start(); worker.kick(); worker.kick();
    assert.equal(calls, 1);
    release();
    await new Promise((resolve) => setTimeout(resolve, 35));
    await worker.stop();
    assert.equal(maxActive, 1);
    assert.ok(calls >= 3);
    const stoppedCalls = calls;
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(calls, stoppedCalls);
});
