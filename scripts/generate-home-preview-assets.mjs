import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
try {
    const page = await browser.newPage();
    for (const [source, destination, width, quality] of [
        ['GitHubPlanet_logo.png', 'GitHubPlanet_logo-700.webp', 700, 0.92],
        ['skybox/front.webp', 'skybox/preview.webp', 768, 0.62]
    ]) {
        const bytes = await readFile(new URL(`../front/img/${source}`, import.meta.url));
        const type = source.endsWith('.png') ? 'image/png' : 'image/webp';
        const encoded = await page.evaluate(async ({ dataUrl, width, quality }) => {
            const image = new Image();
            image.src = dataUrl;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = Math.round(image.naturalHeight * width / image.naturalWidth);
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/webp', quality).split(',')[1];
        }, { dataUrl: `data:${type};base64,${bytes.toString('base64')}`, width, quality });
        await writeFile(new URL(`../front/img/${destination}`, import.meta.url), Buffer.from(encoded, 'base64'));
    }
} finally {
    await browser.close();
}
