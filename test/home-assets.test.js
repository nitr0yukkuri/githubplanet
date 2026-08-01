import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('pins browser dependencies and loads the optimized skybox', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const homeScript = fs.readFileSync('front/js/home.js', 'utf8');

    assert.doesNotMatch(html, /@latest/);
    assert.match(html, /three@0\.160\.0/);
    assert.match(html, /animejs@3\.2\.2/);
    assert.doesNotMatch(html, /rel="preload" href="\/front\/img\/2k_mars\.jpg"/);
    assert.match(homeScript, /right\.webp.*left\.webp.*top\.webp.*bottom\.webp.*front\.webp.*back\.webp/);

    const totalBytes = ['right', 'left', 'top', 'bottom', 'front', 'back']
        .map((name) => fs.statSync(`front/img/skybox/${name}.webp`).size)
        .reduce((sum, size) => sum + size, 0);
    assert.ok(totalBytes < 3_000_000, `optimized skybox is ${totalBytes} bytes`);
});

test('uses the optimized shared background and excludes legacy images from Cloud Run', () => {
    for (const stylesheet of ['achievements.css', 'card.css', 'settings.css']) {
        const css = fs.readFileSync(`front/css/${stylesheet}`, 'utf8');
        assert.match(css, /Achievementsimage\.webp/);
        assert.doesNotMatch(css, /Achievementsimage\.jpg/);
    }

    const optimizedSize = fs.statSync('front/img/Achievementsimage.webp').size;
    assert.ok(optimizedSize < 1024 * 1024, `${optimizedSize} is not below 1 MiB`);

    const dockerIgnore = fs.readFileSync('.dockerignore', 'utf8');
    assert.match(dockerIgnore, /front\/img\/skybox\/\*\.png/);
    assert.match(dockerIgnore, /front\/img\/Achievementsimage\.jpg/);
});
