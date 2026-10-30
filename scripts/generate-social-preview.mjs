import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const logo = await readFile(new URL('../front/img/GitHubPlanet_logo.png', import.meta.url));
const browser = await chromium.launch({ channel: 'chrome' });
try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
        * { box-sizing: border-box; }
        body { margin: 0; width: 1200px; height: 630px; overflow: hidden; color: white;
            background: radial-gradient(ellipse at 72% 12%, #2b2264 0, #100c25 45%, #05050d 90%);
            font-family: Arial, sans-serif; }
        .orbit { position: absolute; width: 1200px; height: 400px; border: 1px solid #8580c633;
            border-radius: 50%; transform: rotate(-22deg); top: 80px; left: 100px; }
        .orbit + .orbit { transform: rotate(20deg); left: -160px; top: 135px; }
        .label { position: absolute; top: 64px; left: 72px; color: #c1b9f5; letter-spacing: 5px; font-size: 16px; }
        img { position: absolute; width: 960px; height: auto; left: 120px; top: 138px; }
        .tagline { position: absolute; bottom: 108px; left: 0; width: 100%; text-align: center; font-size: 30px; }
        .domain { position: absolute; bottom: 42px; right: 72px; font-size: 18px; color: #c1b9f5; letter-spacing: 1px; }
    </style></head><body><div class="orbit"></div><div class="orbit"></div>
        <div class="label">CODE · GROW · EXPLORE</div>
        <img src="data:image/png;base64,${logo.toString('base64')}" alt="GitHub Planet">
        <div class="tagline">Your GitHub activity becomes a planet.</div>
        <div class="domain">githubplanet.dev</div>
    </body></html>`);
    await page.locator('img').evaluate((image) => image.decode());
    await page.screenshot({ path: fileURLToPath(new URL('../front/img/social-preview.png', import.meta.url)) });
    for (const [source, destination, width, quality] of [
        ['favicon.png', 'favicon-96.png', 96, 1]
    ]) {
        const bytes = await readFile(new URL(`../front/img/${source}`, import.meta.url));
        const type = source.endsWith('.png') ? 'image/png' : 'image/webp';
        const outputType = destination.endsWith('.png') ? 'image/png' : 'image/webp';
        const encoded = await page.evaluate(async ({ dataUrl, width, quality, outputType }) => {
            const image = new Image();
            image.src = dataUrl;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = Math.round(image.naturalHeight * width / image.naturalWidth);
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL(outputType, quality).split(',')[1];
        }, { dataUrl: `data:${type};base64,${bytes.toString('base64')}`, width, quality, outputType });
        await writeFile(new URL(`../front/img/${destination}`, import.meta.url), Buffer.from(encoded, 'base64'));
    }
} finally {
    await browser.close();
}
