import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const PUBLIC_PAGES = [
    'index.html',
    'card.html',
    'achievements.html',
    'settings.html',
    '404.html'
];

test('loads the shared GA4 client on every public page except the admin sender', () => {
    for (const page of PUBLIC_PAGES) {
        const html = fs.readFileSync(page, 'utf8');
        assert.match(html, /<script defer src="\/front\/js\/analytics\.js"><\/script>/, page);
    }

    assert.doesNotMatch(fs.readFileSync('sender.html', 'utf8'), /analytics\.js/);
});

test('tracks only real production visits and excludes automated card captures', () => {
    const analytics = fs.readFileSync('front/js/analytics.js', 'utf8');

    assert.match(analytics, /G-96E74LPVN6/);
    assert.match(analytics, /githubplanet-git-543426763451\.asia-northeast2\.run\.app/);
    assert.match(analytics, /URLSearchParams\(window\.location\.search\)\.has\('fix'\)/);
    assert.match(analytics, /window\.gtag\('config', GA_MEASUREMENT_ID\)/);
});
