import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import test from 'node:test';

const rootUrl = new URL('../', import.meta.url);

test('uses accurate icons and locale-specific PWA start routes', async () => {
    const [japanese, english, index] = await Promise.all([
        readFile(new URL('manifest.json', rootUrl), 'utf8').then(JSON.parse),
        readFile(new URL('manifest-en.json', rootUrl), 'utf8').then(JSON.parse),
        readFile(new URL('index.html', rootUrl), 'utf8')
    ]);

    assert.equal(japanese.lang, 'ja');
    assert.equal(japanese.start_url, '/');
    assert.equal(english.lang, 'en');
    assert.equal(english.start_url, '/en');
    assert.deepEqual(japanese.icons.map(({ sizes }) => sizes), ['192x192', '512x512']);
    assert.deepEqual(english.icons.map(({ sizes }) => sizes), ['192x192', '512x512']);
    assert.deepEqual(japanese.icons.map(({ purpose }) => purpose), ['any maskable', 'any maskable']);
    assert.deepEqual(english.icons.map(({ purpose }) => purpose), ['any maskable', 'any maskable']);
    assert.match(index, /apple-touch-icon[^>]+180x180[^>]+apple-touch-icon\.png/);
    assert.match(index, /app-manifest/);
    assert.match(index, /manifest-en\.json/);

    const iconDimensions = await Promise.all([
        readFile(new URL('front/img/apple-touch-icon.png', rootUrl)).then(PNG.sync.read),
        readFile(new URL('front/img/pwa-192.png', rootUrl)).then(PNG.sync.read),
        readFile(new URL('front/img/pwa-512.png', rootUrl)).then(PNG.sync.read)
    ]);
    assert.deepEqual(iconDimensions.map(({ width, height }) => [width, height]), [
        [180, 180],
        [192, 192],
        [512, 512]
    ]);
});

test('removes the legacy cache without intercepting network requests', async () => {
    const serviceWorker = await readFile(new URL('sw.js', rootUrl), 'utf8');

    assert.match(serviceWorker, /caches\.delete/);
    assert.match(serviceWorker, /self\.clients\.claim/);
    assert.doesNotMatch(serviceWorker, /addEventListener\(['"]fetch/);
    assert.doesNotMatch(serviceWorker, /caches\.match/);
});

test('serves both manifests and the service worker from their linked root paths', async () => {
    const pageRoutes = await readFile(
        new URL('src/presentation/http/page-routes.js', rootUrl),
        'utf8'
    );

    assert.match(pageRoutes, /app\.get\('\/manifest\.json'/);
    assert.match(pageRoutes, /app\.get\('\/manifest-en\.json'/);
    assert.match(pageRoutes, /app\.get\('\/sw\.js'/);
    assert.match(pageRoutes, /application\/manifest\+json/);
    assert.match(pageRoutes, /Cache-Control', 'no-cache/);
});
