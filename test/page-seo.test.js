import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { registerPageRoutes } from '../src/presentation/http/page-routes.js';
import { createPageSeo } from '../src/presentation/http/page-seo.js';
import { listShowcasePlanets } from '../src/domain/planet/showcase-planets.js';

const publicBaseUrl = 'https://planet.example';
const showcases = listShowcasePlanets();
let server;
let baseUrl;

before(async () => {
    const app = express();
    app.use('/front', express.static('front'));
    app.use((req, _res, next) => { req.session = {}; next(); });
    registerPageRoutes(app, {
        rootDirectory: process.cwd(), isProduction: false, publicBaseUrl,
        sessionSecret: 'seo-test-secret', showcasePages: showcases
    });
    app.get('/api/seo-probe', (_req, res) => res.json({ ok: true }));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

function tagContent(html, attribute, identity) {
    const tag = html.match(new RegExp(`<meta\\b(?=[^>]*${attribute}="${identity}")[^>]*>`, 'g'));
    assert.equal(tag?.length, 1, `one ${identity} tag`);
    return /content="([^"]*)"/.exec(tag[0])[1];
}

for (const locale of ['ja', 'en']) {
    for (const sample of [null, ...showcases]) {
        const path = sample ? `/showcase/${sample.slug}` : '/';
        const localizedPath = locale === 'en' ? `/en${path === '/' ? '' : path}` : path;
        test(`serves complete ${locale} search metadata and readable content at ${localizedPath}`, async () => {
            const response = await fetch(`${baseUrl}${localizedPath}`);
            assert.equal(response.status, 200);
            const html = await response.text();
            const canonical = `${publicBaseUrl}${localizedPath}`;
            assert.match(html, new RegExp(`<html lang="${locale}">`));
            assert.equal((html.match(/<title>/g) || []).length, 1);
            assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
            assert.ok(html.includes(`href="${canonical}" rel="canonical"`));
            assert.equal(tagContent(html, 'property', 'og:url'), canonical);
            assert.equal(tagContent(html, 'property', 'og:locale'), locale === 'ja' ? 'ja_JP' : 'en_US');
            assert.match(tagContent(html, 'name', 'robots'), /^index, follow/);
            assert.ok(tagContent(html, 'name', 'description').length > 50);
            assert.equal(tagContent(html, 'property', 'og:description'), tagContent(html, 'name', 'description'));
            assert.equal(tagContent(html, 'name', 'twitter:image'), `${publicBaseUrl}/front/img/social-preview.png`);
            assert.equal(tagContent(html, 'property', 'og:image:width'), '1200');
            assert.equal(tagContent(html, 'property', 'og:image:height'), '630');
            assert.equal((html.match(/<h1\b/g) || []).length, 1);
            assert.match(html, /id="site-information"/);
            assert.match(html, /<noscript>/);
            assert.match(html, /data-seo-title="true"/);
            assert.doesNotMatch(html, /<meta[^>]+data-i18n/);
            const structured = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
            assert.equal(structured['@graph'][1].url, canonical);
            assert.equal(structured['@graph'][1].inLanguage, locale);
            assert.equal(structured['@graph'][1]['@type'], sample ? 'WebPage' : 'WebApplication');
            for (const targetLocale of ['ja', 'en']) {
                const target = targetLocale === 'en' ? `/en${path === '/' ? '' : path}` : path;
                assert.ok(html.includes(`href="${publicBaseUrl}${target}" rel="alternate" hreflang="${targetLocale}"`));
                assert.ok(html.includes(`href="${target}" data-home-language="${targetLocale}"`));
            }
            for (const target of showcases) {
                assert.ok(html.includes(`href="${locale === 'en' ? '/en' : ''}/showcase/${target.slug}"`));
            }
            if (sample) {
                assert.ok(html.includes(sample.mainLanguage));
                assert.match(html, locale === 'ja' ? /実在ユーザーのデータではなく/ : /not a live GitHub profile/);
            } else {
                assert.match(html, locale === 'ja' ? /公開リポジトリの言語構成/ : /languages in public repositories/);
            }
        });
    }
}

test('permanently redirects public aliases to one locale and showcase URL without dropping tracking queries', async () => {
    for (const [from, to] of [
        ['/english', '/en'], ['/english/showcase/go/', '/en/showcase/go'], ['/en/', '/en'],
        ['/index.html', '/'], ['/en/index.html', '/en'],
        ['/showcase', '/showcase/typescript'], ['/en/showcase?showcase=cpp', '/en/showcase/cpp'],
        ['/?showcase=go&utm_source=readme', '/showcase/go?utm_source=readme'],
        ['/showcase/%74ypescript', '/showcase/typescript'],
        ['/showcase/TypeScript/', '/showcase/typescript'],
        ['/EN', '/en'], ['/ENGLISH/SHOWCASE/GO/', '/en/showcase/go'],
        ['/SHOWCASE/CSS', '/showcase/css'], ['/EN/INDEX.HTML', '/en']
    ]) {
        const response = await fetch(`${baseUrl}${from}`, { redirect: 'manual' });
        assert.equal(response.status, 301, from);
        assert.equal(response.headers.get('location'), to, from);
    }
});

test('never redirects user-controlled query or encoded paths to another origin', async () => {
    for (const path of ['/?showcase=go&next=https://attacker.example',
        '/english?next=//attacker.example', '/showcase/%2F%2Fattacker.example',
        '/?showcase=//attacker.example']) {
        const response = await fetch(baseUrl + path, { redirect: 'manual' });
        const location = response.headers.get('location');
        if (location) assert.equal(new URL(location, baseUrl).origin, baseUrl);
        else assert.equal(response.status, 404);
    }
});

test('returns real 404s for unknown showcase names and never publishes their canonical URLs', async () => {
    for (const path of ['/showcase/unknown', '/en/showcase/unknown', '/?showcase=unknown', '/showcase/toString',
        '/SHOWCASE/unknown', '/EN/SHOWCASE/unknown']) {
        const response = await fetch(`${baseUrl}${path}`);
        assert.equal(response.status, 404, path);
        assert.match(response.headers.get('x-robots-tag'), /noindex/);
        const html = await response.text();
        assert.doesNotMatch(html, /rel="canonical"/);
        assert.match(html, /404/);
    }
});

test('keeps account screens, APIs, personal cards, and preview variants out of search', async () => {
    for (const path of ['/settings', '/en/achievements', '/sender', '/api/seo-probe',
        '/card.html?username=tester&fix=true', '/demo?showcase=go', '/exhibition',
        '/showcase/go?timeline=preview', '/?preview-achievement=1', '/SENDER', '/EN/SENDER',
        '/API/seo-probe', '/CARD.HTML?fix=true', '/EXHIBITION']) {
        const response = await fetch(`${baseUrl}${path}`);
        assert.equal(response.status, 200, path);
        assert.match(response.headers.get('x-robots-tag'), /noindex/, path);
        if ((response.headers.get('content-type') || '').includes('text/html') && !path.toLowerCase().includes('sender')) {
            const html = await response.text();
            assert.match(tagContent(html, 'name', 'robots'), /noindex/);
            assert.doesNotMatch(html, /rel="canonical"/);
        }
    }
});

test('keeps source content identical for crawlers and browsers regardless of language negotiation', async () => {
    for (const path of ['/', '/en/showcase/kotlin']) {
        const baseline = await (await fetch(baseUrl + path)).text();
        for (const userAgent of ['Googlebot', 'bingbot', 'Twitterbot']) {
            const response = await fetch(baseUrl + path, {
                headers: { 'user-agent': userAgent, 'accept-language': path === '/' ? 'en-US' : 'ja-JP' }
            });
            assert.equal(response.status, 200);
            assert.equal(await response.text(), baseline);
        }
    }
});

test('uses accurate effect descriptions and matching visible showcase breadcrumbs', async () => {
    for (const [locale, effect] of [['ja', '紫色の放電'], ['en', 'purple electrical sparks']]) {
        const path = `${locale === 'en' ? '/en' : ''}/showcase/kotlin`;
        const html = await (await fetch(baseUrl + path)).text();
        assert.ok(tagContent(html, 'name', 'description').includes(effect));
        const graph = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1])['@graph'];
        const breadcrumbs = graph.find((entry) => entry['@type'] === 'BreadcrumbList');
        const page = graph.find((entry) => entry['@type'] === 'WebPage');
        assert.equal(page.breadcrumb['@id'], breadcrumbs['@id']);
        assert.deepEqual(breadcrumbs.itemListElement.map(({ position, item }) => [position, item]), [
            [1, publicBaseUrl + (locale === 'en' ? '/en' : '/')], [2, publicBaseUrl + path]
        ]);
        assert.match(html, /class="site-breadcrumbs"/);
        assert.ok(html.includes(`aria-current="page">${page.name}</a>`));
        assert.match(html, /id="main-ui-wrapper"[^>]+data-nosnippet/);
        assert.equal(graph[0].alternateName, 'GitHubPlanet');
    }
});

test('publishes only canonical Japanese and English public pages in a reciprocal sitemap', async () => {
    const response = await fetch(`${baseUrl}/sitemap.xml`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/xml/);
    const xml = await response.text();
    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    const expected = ['/', ...showcases.map(({ slug }) => `/showcase/${slug}`)]
        .flatMap((path) => [publicBaseUrl + path, publicBaseUrl + `/en${path === '/' ? '' : path}`]);
    assert.deepEqual(new Set(locations), new Set(expected));
    assert.equal(locations.length, expected.length);
    assert.equal((xml.match(/hreflang="x-default"/g) || []).length, expected.length);
    assert.doesNotMatch(xml, /card|settings|achievements|demo|exhibition|lastmod/);
    const titles = new Set();
    const descriptions = new Set();
    for (const location of locations) {
        const path = new URL(location).pathname;
        const page = await fetch(baseUrl + path, { redirect: 'manual' });
        assert.equal(page.status, 200, `${path} must not redirect`);
        assert.equal(page.headers.get('x-robots-tag'), null);
        const html = await page.text();
        assert.equal(tagContent(html, 'property', 'og:url'), location);
        assert.ok(html.includes(`href="${location}" rel="canonical"`));
        titles.add(/<title>(.*?)<\/title>/.exec(html)[1]);
        descriptions.add(tagContent(html, 'name', 'description'));
    }
    assert.equal(titles.size, expected.length, 'every indexed page has a unique title');
    assert.equal(descriptions.size, expected.length, 'every indexed page has a unique description');
    const robots = await fetch(`${baseUrl}/robots.txt`);
    assert.match(robots.headers.get('content-type'), /text\/plain/);
    assert.ok((await robots.text()).includes(`Sitemap: ${publicBaseUrl}/sitemap.xml`));
});

test('keeps configured canonical URLs and locale metadata correct across the production template cache', async (t) => {
    const app = express();
    app.use((req, _res, next) => { req.session = {}; next(); });
    registerPageRoutes(app, {
        rootDirectory: process.cwd(), isProduction: true, publicBaseUrl,
        sessionSecret: 'seo-test-secret', showcasePages: showcases
    });
    const cachedServer = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => cachedServer.once('listening', resolve));
    t.after(() => cachedServer.close());
    const cachedBase = `http://127.0.0.1:${cachedServer.address().port}`;
    for (const path of ['/', '/en/showcase/go', '/showcase/typescript', '/en', '/showcase/go']) {
        const response = await fetch(cachedBase + path, {
            headers: { host: 'attacker.example', 'x-forwarded-host': 'attacker.example' }
        });
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.equal(tagContent(html, 'property', 'og:url'), publicBaseUrl + path);
        assert.equal(tagContent(html, 'property', 'og:locale'), path.startsWith('/en') ? 'en_US' : 'ja_JP');
        assert.doesNotMatch(html, /attacker\.example/);
    }
});

test('supports HEAD and preserves exhibition mode when a showcase query is present', async () => {
    const head = await fetch(`${baseUrl}/showcase/go`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.match(head.headers.get('content-type'), /text\/html/);
    assert.equal(await head.text(), '');
    const missingHead = await fetch(`${baseUrl}/showcase/missing`, { method: 'HEAD' });
    assert.equal(missingHead.status, 404);
    assert.match(missingHead.headers.get('x-robots-tag'), /noindex/);
    const exhibition = await fetch(`${baseUrl}/exhibition?showcase=go`);
    const html = await exhibition.text();
    assert.equal(exhibition.status, 200);
    assert.match(exhibition.headers.get('x-robots-tag'), /noindex/);
    assert.doesNotMatch(html, /<title>Go/);
});

test('serves the declared social image and favicon and avoids executable metadata injection', async () => {
    const image = await readFile(new URL('../front/img/social-preview.png', import.meta.url));
    assert.equal(image.readUInt32BE(16), 1200);
    assert.equal(image.readUInt32BE(20), 630);
    const imageResponse = await fetch(`${baseUrl}/front/img/social-preview.png`);
    assert.equal(imageResponse.status, 200);
    assert.match(imageResponse.headers.get('content-type'), /image\/png/);
    const icon = await fetch(`${baseUrl}/favicon.ico`);
    assert.equal(icon.status, 200);
    const iconBytes = Buffer.from(await icon.arrayBuffer());
    assert.equal(iconBytes.readUInt32BE(16), 96);
    assert.equal(iconBytes.readUInt32BE(20), 96);
    const seo = createPageSeo({ publicBaseUrl, showcasePages: [{
        slug: 'safe', mainLanguage: '<script>alert(1)</script>', planetName: 'sample', totalCommits: 2000
    }] });
    const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const page = seo.resolveHomePage({ path: '/showcase/safe', originalUrl: '/showcase/safe' });
    const html = seo.renderHome(template, page);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1];
    assert.ok(JSON.parse(json)['@graph'][1].name.includes('<script>'));
});
