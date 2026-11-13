import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://127.0.0.1:8898';
const state = path.join(root, '.cloudflare/rt-' + randomUUID().slice(0, 8));
const config = JSON.parse(await fs.readFile(path.join(root, 'wrangler.json'), 'utf8'));
config.main = '../test/fixtures/cloudflare-realtime-worker.js';
config.assets.directory = './assets';
config.alias['iconv-lite'] = './vendor/iconv-lite/lib/index.js';
// この検証はQueueとWebSocketだけを使い、外部DBやGitHubには接続しない。
delete config.hyperdrive;
delete config.triggers;
config.durable_objects.bindings.push({ name: 'CONTROLLED_JOBS', class_name: 'ControlledJobState' });
config.migrations[0].new_sqlite_classes.push('ControlledJobState');
config.vars = {
    NODE_ENV: 'development', PUBLIC_BASE_URL: origin,
    SESSION_SECRET: 'realtime-local-session', SYSTEM_API_KEY: 'realtime-local-admin',
    GITHUB_WEBHOOK_SECRET: 'realtime-local-webhook',
    GITHUB_CLIENT_ID_LOCAL: 'fixture-client', GITHUB_CLIENT_SECRET_LOCAL: 'fixture-secret'
};
await fs.writeFile(path.join(root, '.cloudflare/realtime-wrangler.json'), JSON.stringify(config, null, 2));
const child = spawn(process.execPath, [
    path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev',
    '--config', '.cloudflare/realtime-wrangler.json', '--ip', '127.0.0.1', '--port', '8898',
    '--show-interactive-dev-session=false', '--persist-to', state
], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '', socket;
for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { logs = (logs + chunk).slice(-20_000); });
async function until(check, timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try { if (await check()) return; } catch {}
        await delay(100);
    }
    throw new Error('Local realtime verification timed out');
}
try {
    await until(async () => (await fetch(origin + '/healthz', { signal: AbortSignal.timeout(1000) })).ok, 40_000);
    const race = await fetch(origin + '/__test/publication-race', { signal: AbortSignal.timeout(5000) });
    assert.equal(race.status, 200);
    assert.equal((await race.json()).completed, true, 'A delayed publisher must not block or overwrite a completed consumer');
    socket = new WebSocket(origin.replace('http:', 'ws:') + '/realtime', { headers: { Origin: origin } });
    const events = [];
    socket.on('message', (bytes) => { if (bytes.toString() !== 'pong') events.push(JSON.parse(bytes.toString())); });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const body = JSON.stringify({ repository: { language: 'Ruby' }, commits: Array.from({ length: 2048 }, (_, index) => ({
        id: index.toString(16).padStart(40, '0'), added: ['main.rb'], modified: [], total_lines: 10
    })) });
    const headers = {
        'Content-Type': 'application/json', 'X-GitHub-Event': 'push',
        'X-Hub-Signature-256': 'sha256=' + createHmac('sha256', config.vars.GITHUB_WEBHOOK_SECRET).update(body).digest('hex')
    };
    async function submit() {
        return fetch(origin + '/webhook', {
            method: 'POST', headers: { ...headers, 'X-GitHub-Delivery': randomUUID() }, body,
            signal: AbortSignal.timeout(20_000)
        });
    }
    const started = performance.now();
    const accepted = await submit();
    assert.equal(accepted.status, 200, (await accepted.text()).slice(0, 300));
    const ackMs = Math.round(performance.now() - started);
    await until(() => events.length >= 2048, 60_000);
    assert.equal(events.length, 2048);
    assert.equal(new Set(events.map(event => event.id)).size, 2048);
    const batches = new Set(events.map(event => event.id.split(':')[0])).size;
    assert.equal(batches, 64);
    assert.ok(events.every(event => event.payload.language === 'Ruby'));
    assert.equal((await submit()).status, 200);
    await delay(500);
    assert.equal(events.length, 2048);
    console.log(JSON.stringify({ result: 'PASS', delayedPublisherRace: 'PASS', commits: 2048, queueBatches: batches, localAckMilliseconds: ackMs, duplicateEmissions: 0 }));
} catch (error) {
    await delay(1000);
    console.error(logs);
    throw error;
} finally {
    socket?.terminate();
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    else {
        const exit = new Promise(resolve => child.once('exit', resolve));
        child.kill('SIGTERM');
        await Promise.race([exit, delay(2000)]);
    }
    if (!state.startsWith(path.join(root, '.cloudflare', 'rt-'))) throw new Error('Unsafe test-state path');
    await fs.rm(state, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
