import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
    assert.equal(japanese.icons[0].sizes, '500x500');
    assert.equal(english.icons[0].sizes, '500x500');
    assert.match(index, /app-manifest/);
    assert.match(index, /manifest-en\.json/);
});

test('removes the legacy cache and intercepts network requests', async () => {
    const serviceWorker = await readFile(new URL('sw.js', rootUrl), 'utf8');

    assert.match(serviceWorker, /caches\.delete/);
    assert.match(serviceWorker, /self\.clients\.claim/);
    assert.match(serviceWorker, /addEventListener\(['"]fetch/);
    assert.match(serviceWorker, /caches\.match/);
});
