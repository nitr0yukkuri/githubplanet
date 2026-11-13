import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import WebSocket from 'ws';
import { chromium } from 'playwright';
import { runDatabaseMigrations } from '../src/infrastructure/database/migrations.js';
import { verifyHistoryAggregation } from '../test/fixtures/verify-history-aggregation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL must point to a dedicated local PostgreSQL database');
const database = new URL(databaseUrl);
if (!['localhost', '127.0.0.1'].includes(database.hostname) || !database.pathname.startsWith('/githubplanet_cf')) throw new Error('Cloudflare tests require an isolated local githubplanet_cf database');
const port = Number(process.env.CF_TEST_PORT || 8895);
const origin = 'http://127.0.0.1:' + port;
const pool = new pg.Pool({ connectionString: databaseUrl });
await runDatabaseMigrations(pool, { logger: { log() {} } });
console.log('PASS bounded history aggregation:', await verifyHistoryAggregation(pool));
await pool.query("INSERT INTO planets (github_id, username, planet_color, planet_size_factor, main_language, language_stats, total_commits, planet_name) VALUES (90000001001,'cloudflaretester','#3f9b55',2,'Elm','{\"Elm\":100}',2000,'静かな緑の惑星') ON CONFLICT (github_id) DO UPDATE SET total_commits=2000");
await pool.query('DELETE FROM authored_language_history_scans WHERE github_id=90000001001');
const config = JSON.parse(await fs.readFile(path.join(root, 'wrangler.json'), 'utf8'));
config.main = '../test/fixtures/cloudflare-worker.js';
config.assets.directory = './assets';
config.alias['iconv-lite'] = './vendor/iconv-lite/lib/index.js';
config.hyperdrive[0].localConnectionString = databaseUrl;
config.vars = { NODE_ENV: 'development', PUBLIC_BASE_URL: origin, CALLBACK_URL: origin + '/callback', SESSION_SECRET: 'local-test-session-secret', SYSTEM_API_KEY: 'local-test-admin-key', GITHUB_WEBHOOK_SECRET: 'local-test-webhook-secret', GITHUB_CLIENT_ID_LOCAL: 'fixture-client', GITHUB_CLIENT_SECRET_LOCAL: 'fixture-client-secret' };
config.queues.consumers[0].retry_delay = 1;
await fs.writeFile(path.join(root, '.cloudflare/test-wrangler.json'), JSON.stringify(config, null, 2));
const stateDirectory = path.join(root, '.cloudflare/test-state-' + randomUUID());
const child = spawn(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', '.cloudflare/test-wrangler.json', '--ip', '127.0.0.1', '--port', String(port), '--show-interactive-dev-session=false', '--persist-to', stateDirectory], { cwd: root, env: { ...process.env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
child.stdout.on('data', (chunk) => { logs = (logs + chunk).slice(-20_000); });
child.stderr.on('data', (chunk) => { logs = (logs + chunk).slice(-20_000); });
const sockets = [];
let browser;
const fetchRoute = (route, options = {}) => fetch(origin + route, { ...options, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
async function until(fn, timeout = 20_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { try { const value = await fn(); if (value) return value; } catch {} await delay(150); }
    throw new Error('Timed out waiting for local Workers verification');
}
async function socket() {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/realtime', { headers: { Origin: origin } });
    const events = [];
    ws.on('message', (data) => { if (data.toString() !== 'pong') events.push(JSON.parse(data.toString())); });
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    sockets.push(ws); return { ws, events };
}
try {
    await until(async () => (await fetchRoute('/healthz')).ok, 40_000);
    console.log('PASS Workers startup and PostgreSQL connection');
    for (const route of ['/showcase/elm', '/en/card.html?showcase=perl']) {
        const response = await fetchRoute(route); assert.equal(response.status, 200);
        const html = await response.text(); assert.match(html, /<html/); assert.match(html, /githubplanet-realtime-transport.*websocket/);
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
    assert.equal((await fetchRoute('/card.html?showcase=missing')).status, 404);
    assert.equal((await fetchRoute('/front/img/2k_mars.jpg')).status, 200);
    assert.equal((await fetchRoute('/api/me')).status, 401);
    console.log('PASS HTML, locale, assets, showcase API and anonymous authorization');

    const login = await fetchRoute('/login'); assert.equal(login.status, 302);
    let cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const authorization = new URL(login.headers.get('location'));
    const state = authorization.searchParams.get('state'); assert.ok(state);
    assert.equal(authorization.searchParams.get('redirect_uri'), origin + '/callback');
    const callback = await fetchRoute('/callback?code=fixture&state=' + state, { headers: { Cookie: cookie } });
    assert.equal(callback.status, 302);
    if (callback.headers.getSetCookie().length) cookie = callback.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const preview = await fetchRoute('/api/me/planet-preview', { headers: { Cookie: cookie } });
    assert.equal(preview.status, 200); const data = await preview.json(); assert.equal(data.user.id, 90000001001); assert.equal(data.planetData.totalCommits, 2000);
    assert.equal((await fetchRoute('/callback?code=fixture&state=' + state, { headers: { Cookie: cookie } })).status, 400);
    assert.ok(!cookie.includes('fixture-github-access-token'));
    console.log('PASS PostgreSQL-backed OAuth session, callback replay rejection and saved planet API');

    const a = await socket(), b = await socket();
    const pong = new Promise((resolve) => a.ws.once('message', (data) => resolve(data.toString()))); a.ws.send('ping'); assert.equal(await pong, 'pong');
    const wrongKey = await fetchRoute('/api/meteor', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'wrong' }, body: JSON.stringify({ language: 'JavaScript', color: '#f0db4f', scale: 1 }) });
    assert.equal(wrongKey.status, 401);
    const manual = await fetchRoute('/api/meteor', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'local-test-admin-key' }, body: JSON.stringify({ language: 'JavaScript', color: '#f0db4f', scale: 1 }) });
    assert.equal(manual.status, 200); await until(() => a.events.length === 1 && b.events.length === 1);
    assert.equal(a.events[0].id, b.events[0].id); assert.equal(a.events[0].payload.color, '#f0db4f');
    console.log('PASS two-client meteor broadcast, automatic heartbeat reply and sender authorization');

    const deliveryId = randomUUID();
    const webhook = JSON.stringify({ repository: { language: 'Ruby' }, commits: [{ id: 'abcdef1234567', added: ['main.rb'], modified: [], total_lines: 10 }] });
    const signature = 'sha256=' + createHmac('sha256', 'local-test-webhook-secret').update(webhook).digest('hex');
    const headers = { 'Content-Type': 'application/json', 'X-GitHub-Event': 'push', 'X-GitHub-Delivery': deliveryId, 'X-Hub-Signature-256': signature };
    assert.equal((await fetchRoute('/webhook', { method: 'POST', headers, body: webhook })).status, 200);
    assert.equal((await fetchRoute('/webhook', { method: 'POST', headers, body: webhook })).status, 200);
    await until(() => a.events.length >= 2 && b.events.length >= 2);
    await delay(1500); assert.equal(a.events.length, 2); assert.equal(b.events.length, 2); assert.equal(a.events[1].payload.language, 'Ruby');
    const invalid = await fetchRoute('/webhook', { method: 'POST', headers: { ...headers, 'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64) }, body: webhook });
    assert.equal(invalid.status, 401);
    console.log('PASS signed webhook Queue delivery and duplicate event suppression');

    const csrfResponse = await fetchRoute('/api/csrf-token', { headers: { Cookie: cookie } });
    assert.equal(csrfResponse.status, 200);
    const { csrfToken } = await csrfResponse.json();
    assert.equal((await fetchRoute('/api/me/authored-language-history/scan', { method: 'POST', headers: { Cookie: cookie } })).status, 403);
    const scan = await fetchRoute('/api/me/authored-language-history/scan', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken } });
    assert.equal(scan.status, 200);
    await until(async () => { const result = await pool.query('SELECT scan_status FROM authored_language_history_scans WHERE github_id=90000001001'); return result.rows[0]?.scan_status === 'complete'; });
    console.log('PASS queued history scan with token lookup from the session store');
    assert.equal((await fetchRoute('/realtime', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
    for (let index = 0; index < 99; index++) assert.equal((await fetchRoute('/api/me')).status, 401);
    const limited = await fetchRoute('/api/me'); assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
    assert.equal((await fetchRoute('/api/me/planet-preview', { headers: { Cookie: cookie } })).status, 200);
    console.log('PASS cross-request rate limits and WebSocket origin rejection');
    const parallel = await Promise.all(Array.from({length:20}, async (_,index) => {
        const response = await fetchRoute('/api/me/authored-language-history', {headers:index%2 ? {Cookie:cookie} : {}});
        assert.equal(response.status,index%2 ? 200 : 401);
    }));
    await pool.query("INSERT INTO session (sid,sess,expire) VALUES ('cf-test-expired','{}','2001-01-01') ON CONFLICT (sid) DO UPDATE SET expire='2001-01-01'");
    assert.equal((await fetchRoute('/_test/prune-sessions')).status,200);
    assert.equal((await pool.query("SELECT sid FROM session WHERE sid='cf-test-expired'")).rows.length,0);
    assert.equal((await fetchRoute('/api/me/authored-language-history',{headers:{Cookie:cookie}})).status,200);
    console.log('PASS concurrent session isolation and expired-session cleanup');
    const largeBody=JSON.stringify({repository:{language:'Rust'},commits:[{id:'large-payload',message:'x'.repeat(26*1024*1024),added:['a.rs']}]});
    const largeSignature='sha256='+createHmac('sha256','local-test-webhook-secret').update(largeBody).digest('hex');
    assert.equal((await fetchRoute('/webhook',{method:'POST',headers:{...headers,'X-GitHub-Delivery':randomUUID(),'X-Hub-Signature-256':largeSignature},body:largeBody})).status,200);
    await until(()=>a.events.some(event=>event.payload.language==='Rust'));
    console.log('PASS 26 MiB webhook streaming without storing the commit message');

    browser = await chromium.launch({ channel: process.env.CF_BROWSER_CHANNEL || 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const pageErrors = []; const oldOrigin = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => { if (request.url().includes('.run.app')) oldOrigin.push(request.url()); });
    await page.goto(origin + '/card.html?showcase=elm&fix=true');
    await page.waitForSelector('#planet-canvas canvas', { timeout: 20_000 });
    await page.screenshot({ path: path.join(root, '.cloudflare/elm-card-mobile.png'), fullPage: true });
    await page.goto(origin + '/showcase/elm');
    await page.waitForSelector('canvas', { timeout: 20_000 });
    assert.equal(await page.locator('meta[name="githubplanet-realtime-transport"]').getAttribute('content'), 'websocket');
    await page.screenshot({ path: path.join(root, '.cloudflare/elm-home-mobile.png'), fullPage: true });
    assert.deepEqual(pageErrors, []); assert.deepEqual(oldOrigin, []);
    console.log('PASS mobile Chrome rendering for home/card with no JavaScript errors or Cloud Run socket requests');
    console.log('Cloudflare integration verification completed.');
} catch (error) { console.error(logs); throw error; }
finally {
    for (const ws of sockets) ws.terminate();
    await browser?.close();
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
    await pool.end();
    if (!stateDirectory.startsWith(path.join(root, '.cloudflare', 'test-state-'))) throw new Error('Unexpected test-state cleanup path');
    await fs.rm(stateDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
