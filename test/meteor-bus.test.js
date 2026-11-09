import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { Server } from 'socket.io';
import { createMeteorBus } from '../src/infrastructure/realtime/meteor-bus.js';
import { createMemoryMeteorStore } from './fixtures/meteor-store.js';

const payload = { color: '#f0db4f', language: 'JavaScript', scale: 1 };
const quiet = { warn() {} };
async function until(predicate) {
    const end = Date.now() + 2000;
    while (!predicate()) { assert.ok(Date.now() < end, 'condition timed out'); await new Promise((resolve) => setTimeout(resolve, 5)); }
}

test('two Socket.IO instances deliver a shared event once to both live WebSocket receivers', async () => {
    const store = createMemoryMeteorStore();
    let subscriptions = 0;
    const instances = await Promise.all([0, 1].map(async () => {
        const server = http.createServer(), io = new Server(server);
        const bus = createMeteorBus({ store, emit: (value) => io.emit('meteor', value), intervalMs: 5 });
        io.on('connection', (socket) => {
            socket.on('disconnect', () => bus.unsubscribe(socket.id));
            void bus.subscribe(socket.id).then(() => { subscriptions++; });
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/socket.io/?EIO=4&transport=websocket`);
        const received = [];
        ws.addEventListener('message', ({ data }) => {
            const packet = String(data);
            if (packet.startsWith('0')) ws.send('40');
            if (packet === '2') ws.send('3');
            if (packet.startsWith('42')) { const [name, value] = JSON.parse(packet.slice(2)); if (name === 'meteor') received.push(value); }
        });
        return { bus, io, ws, received };
    }));
    try {
        await until(() => subscriptions === 2);
        await instances[0].bus.publish(payload, 'same-webhook-job');
        await until(() => instances.every((instance) => instance.received.length === 1));
        await instances[1].bus.publish(payload, 'same-webhook-job');
        await new Promise((resolve) => setTimeout(resolve, 25));
        assert.deepEqual(instances.map((instance) => instance.received), [[payload], [payload]]);
        assert.equal(store.events.length, 1);
    } finally {
        instances.forEach(({ ws }) => ws.close());
        await Promise.all(instances.map(async ({ bus, io }) => { await bus.stop(); await new Promise((resolve) => io.close(resolve)); }));
    }
});

test('does not read without viewers and starts a new subscription at the current stream position', async () => {
    const store = createMemoryMeteorStore(), events = [];
    const bus = createMeteorBus({ store, emit: (value) => events.push(value), intervalMs: 5 });
    try {
        await bus.publish(payload, 'before-viewing');
        await new Promise((resolve) => setTimeout(resolve, 15));
        assert.equal(store.reads, 0);
        await bus.subscribe('viewer');
        await bus.publish(payload, 'during-viewing');
        await until(() => events.length === 1);
        bus.unsubscribe('viewer');
        await new Promise((resolve) => setTimeout(resolve, 10));
        const reads = store.reads;
        await bus.publish(payload, 'after-disconnect');
        await new Promise((resolve) => setTimeout(resolve, 15));
        assert.equal(store.reads, reads);
        await bus.subscribe('reconnected');
        assert.equal(events.length, 1, 'old offline meteors must not be replayed');
    } finally { await bus.stop(); }
});

test('a temporary reader failure retries from the same cursor without losing a persisted event', async () => {
    const store = createMemoryMeteorStore(), events = [];
    let fail = false;
    const read = store.readAfter;
    store.readAfter = async (...args) => { if (fail) throw new Error('DB unavailable'); return read(...args); };
    const bus = createMeteorBus({ store, emit: (value) => events.push(value), intervalMs: 5, logger: quiet });
    try {
        await bus.subscribe('viewer');
        fail = true;
        await bus.publish(payload, 'persisted-during-read-failure');
        assert.equal(events.length, 0);
        fail = false;
        await until(() => events.length === 1);
        assert.deepEqual(events, [payload]);
    } finally { await bus.stop(); }
});
