import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import { chromium } from 'playwright';

const socket = net.createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DATABASE_URL: '', GEMINI_API_KEY: '',
        NODE_ENV: 'test', PUBLIC_BASE_URL: baseUrl,
        GITHUB_CLIENT_ID_LOCAL: 'startup-audit', GITHUB_CLIENT_SECRET_LOCAL: 'startup-audit' },
    stdio: ['ignore', 'pipe', 'pipe']
});
let browser;
try {
    await new Promise((resolve, reject) => {
        let output = '';
        const timeout = setTimeout(() => reject(new Error(`Startup timed out: ${output}`)), 45_000);
        const onData = (chunk) => {
            output += chunk;
            if (output.includes('Server running on port')) { clearTimeout(timeout); resolve(); }
        };
        server.stdout.on('data', onData);
        server.stderr.on('data', onData);
        server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited (${code}): ${output}`)); });
    });
    await mkdir('artifacts/home-startup', { recursive: true });
    browser = await chromium.launch({ channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    assert.ok(!requests.includes('/front/js/home.js'), 'welcome defers the 3D module');
    assert.ok(await page.locator('.welcome-logo').evaluate((image) => image.currentSrc.includes('logo-700.webp')));
    const bounds = await page.locator('#welcome-modal').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'welcome fits mobile width');
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844, 'welcome fits mobile height');
    await page.screenshot({ path: 'artifacts/home-startup/welcome-390.png' });
    await page.locator('#welcome-ok-btn').click();
    await page.waitForFunction(() => document.querySelector('#main-ui-wrapper')?.style.display === 'block');
    assert.equal(await page.locator('#welcome-modal').isVisible(), false);
    assert.ok(requests.includes('/front/js/home.js'), '3D starts after accepting the welcome');
    for (const path of ['/exhibition', '/en/exhibition']) {
        await page.goto(baseUrl + path, { waitUntil: 'domcontentloaded' });
        await page.locator('#welcome-ok-btn').click();
        await page.waitForFunction(() => document.querySelector('#main-ui-wrapper')?.style.display === 'block');
        assert.equal(await page.locator('#welcome-modal').isVisible(), false, 'exhibition needs only one confirmation');
    }
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#main-ui-wrapper')?.style.display === 'block');
    assert.equal(await page.locator('#welcome-modal').isVisible(), false, 'returning visitors start immediately');
    const freshContext = await browser.newContext();
    const showcase = await freshContext.newPage();
    showcase.on('pageerror', (error) => errors.push(error.message));
    for (const path of ['/showcase/typescript', '/demo']) {
        await showcase.goto(baseUrl + path, { waitUntil: 'domcontentloaded' });
        await showcase.waitForFunction(() => document.querySelector('#planet-owner-display')?.textContent.includes('SHOWCASE_'));
        assert.equal(await showcase.locator('#welcome-modal').isVisible(), false, 'public planets start without the welcome');
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', firstVisit: true, exhibition: ['ja', 'en'],
        returningVisit: true, showcase: true, demo: true, mobileWidth: 390 }, null, 2));
} finally {
    await browser?.close();
    server.kill();
}
