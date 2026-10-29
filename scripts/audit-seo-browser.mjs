import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from 'playwright';
import { listShowcasePlanets } from '../src/domain/planet/showcase-planets.js';

const socket = net.createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DATABASE_URL: '', GEMINI_API_KEY: '',
        NODE_ENV: 'test', PUBLIC_BASE_URL: baseUrl,
        GITHUB_CLIENT_ID_LOCAL: 'seo-audit', GITHUB_CLIENT_SECRET_LOCAL: 'seo-audit' },
    stdio: ['ignore', 'pipe', 'pipe']
});
let browser;
try {
    await new Promise((resolve, reject) => {
        let output = '';
        const timeout = setTimeout(() => reject(new Error(`SEO audit server startup timed out: ${output}`)), 45_000);
        const onData = (chunk) => {
            output += chunk;
            if (output.includes('Server running on port')) { clearTimeout(timeout); resolve(); }
        };
        server.stdout.on('data', onData);
        server.stderr.on('data', onData);
        server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited (${code}): ${output}`)); });
    });
    browser = await chromium.launch({ channel: 'chrome' });
    const sourceContext = await browser.newContext({ javaScriptEnabled: false });
    const sourcePage = await sourceContext.newPage();
    await sourcePage.goto(`${baseUrl}/en/showcase/typescript`, { waitUntil: 'domcontentloaded' });
    assert.equal(await sourcePage.title(), 'TypeScript Planet Showcase | GitHub Planet');
    assert.equal(await sourcePage.locator('html').getAttribute('lang'), 'en');
    assert.equal(await sourcePage.locator('#site-information').count(), 0);
    assert.match(await sourcePage.locator('.site-noscript').textContent(), /JavaScript is required/);
    await sourceContext.close();

    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseUrl}/en/showcase/typescript`, { waitUntil: 'domcontentloaded' });
    const titleBefore = await page.title();
    const canonicalBefore = await page.locator('link[rel="canonical"]').getAttribute('href');
    await page.evaluate(async () => (await import('/front/js/i18n.js')).applyI18n());
    await page.waitForFunction(() => document.querySelector('#planet-owner-display')?.textContent.includes('SHOWCASE_'), null, { timeout: 30_000 });
    assert.equal(await page.locator('#welcome-modal').isVisible(), false);
    assert.equal(await page.title(), titleBefore);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), canonicalBefore);
    assert.equal(await page.locator('[data-home-language="ja"]').getAttribute('href'), '/showcase/typescript');
    assert.equal(await page.locator('#main-ui-wrapper').getAttribute('data-nosnippet'), '');
    for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
        assert.equal(await page.locator('#site-information').count(), 0, `about disclosure is absent at ${width}px`);
    }
    const sitemapCount = await page.evaluate(async () => {
        const xml = await (await fetch('/sitemap.xml')).text();
        const document = new DOMParser().parseFromString(xml, 'application/xml');
        if (document.querySelector('parsererror')) throw new Error('Invalid sitemap XML');
        return document.getElementsByTagName('loc').length;
    });
    assert.equal(sitemapCount, (listShowcasePlanets().length + 1) * 2);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', sourceWithoutJavaScript: true,
        metadataPreservedAfterJavaScript: true, aboutDisclosureRemoved: true,
        mobileWidths: [320, 390], sitemapUrls: sitemapCount }, null, 2));
} finally {
    await browser?.close();
    server.kill();
}
