import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

function readPositiveInteger(name, fallback) {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer.`);
    }
    return value;
}

const targetUrl = process.env.CARD_RECORD_URL
    ?? 'https://githubplanet.dev/card.html?username=nitr0yukkuri&fix=true';
const outputPath = path.resolve(process.env.CARD_RECORD_OUTPUT ?? 'artifacts/profile-card.webm');
const videoDir = path.resolve(process.env.CARD_RECORD_VIDEO_DIR ?? 'artifacts/.playwright-video');
const width = readPositiveInteger('CARD_RECORD_WIDTH', 1200);
const height = readPositiveInteger('CARD_RECORD_HEIGHT', 400);
const warmupMs = readPositiveInteger('CARD_RECORD_WARMUP_MS', 2000);
const recordMs = readPositiveInteger('CARD_RECORD_MS', 5000);
const browserChannel = process.env.CARD_RECORD_BROWSER_CHANNEL;

await rm(videoDir, { recursive: true, force: true });
await mkdir(videoDir, { recursive: true });
await mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch(browserChannel ? { channel: browserChannel } : {});
const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    recordVideo: {
        dir: videoDir,
        size: { width, height }
    }
});

try {
    const page = await context.newPage();
    const video = page.video();

    page.on('pageerror', (error) => console.error(`[page error] ${error.message}`));
    page.on('console', (message) => {
        if (message.type() === 'error') {
            console.error(`[browser console] ${message.text()}`);
        }
    });

    const url = new URL(targetUrl);
    url.searchParams.set('time', Date.now().toString());

    console.log(`Opening ${url.toString()}`);
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.waitForFunction(() => {
        const canvas = document.querySelector('#planet-canvas canvas');
        const username = document.querySelector('#username-display')?.textContent?.trim();
        const language = document.querySelector('#main-lang-stat')?.textContent?.trim();
        const planetName = document.querySelector('#planet-name-sub')?.textContent?.trim();

        return canvas instanceof HTMLCanvasElement
            && canvas.width > 0
            && canvas.height > 0
            && username
            && username !== 'USERNAME'
            && language
            && language !== 'LOADING'
            && language !== 'UNKNOWN'
            && planetName
            && planetName !== 'UNKNOWN PLANET'
            && planetName !== 'ERROR PLANET';
    }, undefined, { timeout: 60000 });

    console.log(`Card is ready. Waiting ${warmupMs}ms for rendering to settle.`);
    await page.waitForTimeout(warmupMs);

    console.log(`Recording ${recordMs}ms of the existing card animation.`);
    await page.waitForTimeout(recordMs);

    await context.close();
    await video.saveAs(outputPath);
    console.log(`Saved recording to ${outputPath}`);
} finally {
    await context.close().catch(() => {});
    await browser.close();
    await rm(videoDir, { recursive: true, force: true });
}
