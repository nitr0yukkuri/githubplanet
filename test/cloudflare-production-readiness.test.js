import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import session from 'express-session';
import { createWorkerPool } from '../cloudflare/database.js';
import { consumeJobs, createJobDispatch } from '../cloudflare/jobs.js';
import { createApplication } from '../src/bootstrap/create-application.js';
import { createMeteorService } from '../src/application/meteor-service.js';

test('a maximum-size push persists bounded batches and preserves every meteor', async () => {
    const saved = [];
    const env = { JOB_STATE: { getByName: () => ({ async enqueue(job) { saved.push(job); } }) } };
    const inputs = Array.from({ length: 2048 }, (_, index) => ({ commitId: 'commit-' + index, language: 'Ruby', scale: 1 }));
    await createJobDispatch(env).enqueueWebhookInputs(inputs, { deliveryId: 'fixture', payloadHash: 'b'.repeat(64) });
    assert.equal(saved.length, 64);
    assert.deepEqual(saved.flatMap(job => job.inputs), inputs);
    for (const job of saved) assert.ok(Buffer.byteLength(JSON.stringify(job)) < 128000);
});

test('a batch retry keeps a distinct stable delivery identifier for each meteor', async () => {
    const body = { id: 'a'.repeat(64), hash: 'b'.repeat(64), type: 'meteor-batch', inputs: [
        { commitId: 'first', language: 'Ruby', scale: 1 }, { commitId: 'second', language: 'Ruby', scale: 1 }
    ] };
    const delivered = new Map();
    const state = { async claim() { return { token: 'lease' }; }, async finish() {}, async release() {} };
    let failing = true, acknowledged = 0, retried = 0;
    const runtime = () => ({ meteorService: createMeteorService({
        languageColorService: { async resolveLanguageColor() { return '#abcdef'; } }, logger: { log() {} },
        async emitMeteor(payload, options) {
            if (failing && options.idempotencyKey.endsWith(':1')) throw new Error('Connection interrupted');
            delivered.set(options.idempotencyKey, payload);
        }
    }) });
    const message = { body, ack() { acknowledged++; }, retry() { retried++; } };
    const env = { JOB_STATE: { getByName: () => state } };
    await consumeJobs({ messages: [message] }, env, {}, runtime);
    assert.equal(delivered.size, 1);
    failing = false;
    await consumeJobs({ messages: [message] }, env, {}, runtime);
    assert.equal(delivered.size, 2);
    assert.equal(acknowledged, 1);
    assert.equal(retried, 1);
});

test('an interrupted job waits for the active lease before consuming another retry', async () => {
    const id = 'a'.repeat(64);
    let delay;
    const message = {
        body: { id, hash: id, type: 'meteor', input: { commitId: 'commit', language: 'Ruby', scale: 1 } },
        retry(options) { delay = options.delaySeconds; },
        ack() { assert.fail('A running job must not be acknowledged'); }
    };
    const state = { async claim() { return { busy: true, retryAfterSeconds: 900 }; } };
    await consumeJobs({ messages: [message] }, { JOB_STATE: { getByName: () => state } }, {}, () => {
        assert.fail('A running job must not execute concurrently');
    });
    assert.ok(delay > 900, 'One retry must cover the entire lease, rather than exhausting retries in eight minutes');
    state.claim = async () => ({ busy: true });
    await consumeJobs({ messages: [message] }, { JOB_STATE: { getByName: () => state } }, {}, () => assert.fail());
    assert.ok(delay > 900, 'A previous DO version without a duration must also wait for the full lease');
});

test('a stalled PostgreSQL query times out and releases its connection', async (t) => {
    const sockets = new Set();
    let querySeen = false;
    function frame(type, body) {
        const length = Buffer.alloc(4);
        length.writeInt32BE(body.length + 4);
        return Buffer.concat([Buffer.from(type), length, body]);
    }
    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        let ready = false;
        socket.on('data', () => {
            if (!ready) {
                ready = true;
                socket.write(Buffer.concat([frame('R', Buffer.alloc(4)), frame('Z', Buffer.from('I'))]));
            } else {
                querySeen = true;
                // 接続自体は生かし、DBが応答しなくなった状態を再現する。
            }
        });
    });
    server.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const pool = createWorkerPool({
        NODE_ENV: 'production',
        POSTGRES: { connectionString: `postgresql://fixture:fixture@127.0.0.1:${server.address().port}/fixture` }
    }, { queryTimeoutMs: 50 });
    const safetyStop = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 1500);
    t.after(async () => {
        clearTimeout(safetyStop);
        for (const socket of sockets) socket.destroy();
        await pool.end();
        await new Promise((resolve) => server.close(resolve));
    });
    await assert.rejects(pool.query('SELECT stalled_response'), /query read timeout/i);
    assert.equal(querySeen, true);
    assert.equal(pool.totalCount, 0, 'A timed-out connection must not remain in the pool');
});

test('production OAuth uses a secure persisted session behind HTTPS termination', async (t) => {
    const { app } = createApplication({
        rootDirectory: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
        env: {
            NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://githubplanet.dev',
            SESSION_SECRET: 'readiness-only-session', SYSTEM_API_KEY: 'readiness-only-admin',
            GITHUB_WEBHOOK_SECRET: 'readiness-only-webhook',
            GITHUB_CLIENT_ID: 'readiness-client', GITHUB_CLIENT_SECRET: 'readiness-client-secret'
        },
        sessionStore: new session.MemoryStore(), logRuntimeConfiguration: false,
        emitMeteor() {}
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => {
        server.closeAllConnections();
        return new Promise((resolve) => server.close(resolve));
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const headers = { Host: 'githubplanet.dev', 'X-Forwarded-Proto': 'https' };
    const login = await fetch(origin + '/login', { headers, redirect: 'manual' });
    assert.equal(login.status, 302);
    const authorization = new URL(login.headers.get('location'));
    assert.equal(authorization.searchParams.get('redirect_uri'), 'https://githubplanet.dev/callback');
    const cookie = login.headers.getSetCookie().find((value) => value.startsWith('__session='));
    assert.ok(cookie);
    assert.match(cookie, /; Secure(?:;|$)/);
    assert.match(cookie, /; HttpOnly(?:;|$)/);
    assert.match(cookie, /; SameSite=Lax(?:;|$)/);
    const invalid = await fetch(origin + '/callback?code=fixture&state=invalid', {
        headers: { ...headers, Cookie: cookie.split(';')[0] }, redirect: 'manual'
    });
    assert.equal(invalid.status, 400);
});
