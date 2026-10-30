import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { Server } from 'socket.io';
import { chromium } from 'playwright';
import { createPlanetQueryService } from '../src/application/planet-query-service.js';
import { registerPlanetRoutes } from '../src/presentation/http/planet-routes.js';

// 本番への負荷やDB更新を避け、観測したAPI待ちをローカルの固定遅延で再現する。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = process.env.HOME_PERF_BASELINE || 'df97b57ef828d45fc9a35aa116fecedede72919e';
const samples = Number(process.env.HOME_PERF_SAMPLES || 10);
assert.ok(Number.isInteger(samples) && samples >= 0 && samples <= 50);
const out = path.join(root, 'artifacts/home-login-performance');
await mkdir(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const user = { id: 740000002, login: 'performance-user', html_url: 'https://github.com/performance-user' };
const savedPlanet = { githubId: user.id, username: user.login, mainLanguage: 'TypeScript',
    planetColor: '#007acc', languageStats: { TypeScript: 51, JavaScript: 20, CSS: 12 },
    totalCommits: 4626, weeklyCommits: 25, planetSizeFactor: 1.4, planetName: '堅牢な蒼穹の帝星',
    achievements: {}, activeTitle: { prefix: '古参の', suffix: '架け橋' } };
const freshPlanet = { ...savedPlanet, totalCommits: 4629 };
let anime;
try { anime = await readFile(path.join(out, 'anime-3.2.2.js'), 'utf8'); }
catch {
    const response = await fetch('https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.es.js');
    assert.ok(response.ok);
    anime = await response.text();
    await writeFile(path.join(out, 'anime-3.2.2.js'), anime);
}
const versions = {};
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    for (const variant of ['before', 'after']) {
        const app = express();
        let requests = 0;
        let scenario = 'normal';
        const source = file => variant === 'before'
            ? execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, encoding: 'utf8' })
            : null;
        const replacements = [
            ['https://cdn.jsdelivr.net/npm/three@0.160.0/', '/benchmark/vendor/three/'],
            ['https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.es.js', '/benchmark/vendor/anime.js'],
            ['https://cdn.jsdelivr.net/npm/socket.io-client@4.7.2/dist/socket.io.esm.min.js', '/benchmark/vendor/socket.js']
        ];
        let html = source('index.html') || await readFile(path.join(root, 'index.html'), 'utf8');
        for (const [from, to] of replacements) html = html.replaceAll(from, to);
        app.get('/benchmark/vendor/anime.js', (_req, res) => res.type('js').send(anime));
        app.get('/benchmark/vendor/socket.js', (_req, res) => res.sendFile(path.join(root, 'node_modules/socket.io/client-dist/socket.io.esm.min.js')));
        app.use('/benchmark/vendor/three', express.static(path.join(root, 'node_modules/three')));
        app.get('/front/js/analytics.js', (_req, res) => res.type('js').send(''));
        if (variant === 'before') {
            for (const file of ['front/js/home.js', 'front/js/home-bootstrap.js', 'front/js/i18n.js', 'front/js/planet-scene-resources.js', 'front/css/home.css']) {
                let body = source(file);
                if (file.endsWith('/home.js')) {
                    // 比較元には観測マークだけを足し、通信順序・演出時間・描画処理は変えない。
                    body = body.replace('let planetLoadGeneration = 0;', 'let planetLoadGeneration = 0; let renderedPlanetGeneration = 0;');
                    body = body.replace('if (frameStartedAt !== null) recordHomeAnimationFrame(frameStartedAt);', `if (frameStartedAt !== null) {
                        if (planetGroup?.parent === scene && planetGroup.scale.x > 0.01 && renderedPlanetGeneration !== planetLoadGeneration) {
                            renderedPlanetGeneration = planetLoadGeneration;
                            recordHomePerformance('loadPlanet:planet-visible');
                        }
                        recordHomeAnimationFrame(frameStartedAt);
                    }`);
                    body = body.replace('await loadPlanet(data);', "await loadPlanet(data); recordHomePerformance('initial:scene-ready', { fromSaved: false });");
                }
                app.get(`/${file}`, (_req, res) => res.type(file.endsWith('.css') ? 'css' : 'js').send(body));
            }
        }
        app.use('/front', express.static(path.join(root, 'front'), { maxAge: '30d' }));
        app.use(session({ secret: 'isolated-performance-session', resave: false, saveUninitialized: false }));
        app.get('/benchmark/login', (req, res) => {
            scenario = String(req.query.scenario || 'normal');
            req.session.github_token = 'isolated-performance-token';
            req.session.planetData = { user, planetData: null };
            req.session.last_updated = 0;
            res.redirect('/');
        });
        app.get('/', (_req, res) => res.type('html').send(html));
        app.get('/api/planets/user/other-user', (_req, res) => res.json({ ...savedPlanet, username: 'other-user', githubId: 740000003 }));
        const repository = { async findByGithubId() {
            await sleep(scenario === 'fast-current' ? 300 : 120);
            if (scenario === 'new-user') return null;
            if (scenario === 'preview-fails') throw new Error('Isolated preview failure');
            return savedPlanet;
        } };
        const planetService = {
            async refreshAuthenticatedUser() { await sleep(scenario === 'fast-current' ? 10 : 440); return user; },
            async updateAndSavePlanetData() {
                requests++;
                await sleep(scenario === 'fast-current' ? 20 : 3490);
                if (scenario === 'refresh-fails') throw new Error('Isolated refresh failure');
                return { ...freshPlanet, ...(scenario === 'language-changes'
                    ? { mainLanguage: 'JavaScript', planetColor: '#f0db4f', languageStats: { JavaScript: 80, TypeScript: 20 } } : {}),
                    observedTotalContributions: 4629, isNewPlanet: scenario === 'new-user' };
            },
            async recordLoginProgress() { await sleep(scenario === 'fast-current' ? 10 : 120); return { contributionDelta: 0, newlyUnlockedAchievementIds: [] }; }
        };
        registerPlanetRoutes(app, { planetService, planetQueryService: createPlanetQueryService({ repository }), cacheDuration: 3600000 });
        const server = http.createServer(app);
        const io = new Server(server);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        versions[variant] = { io, server, baseUrl: `http://127.0.0.1:${server.address().port}`, requests: () => requests };
    }
    const results = [];
    for (let iteration = samples > 0 ? -1 : 0; iteration < samples; iteration++) {
        for (const variant of iteration % 2 === 0 ? ['before', 'after'] : ['after', 'before']) {
            const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(() => { localStorage.setItem('githubPlanetVisited', 'true'); window.__GITHUB_PLANET_PERF__ = true; });
            const server = versions[variant];
            const count = server.requests();
            await page.goto(`${server.baseUrl}/benchmark/login`, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window.__githubPlanetPerfEvents?.some(e => e.event === 'loadPlanet:planet-visible'), null, { timeout: 20000 });
            if (iteration === 0) await page.screenshot({ path: path.join(out, `${variant}-first.png`) });
            await page.waitForFunction(() => document.getElementById('commit-count-val')?.textContent === '4629'
                && window.__githubPlanetPerfEvents?.some(e => ['initial:current-ready', 'initial:scene-ready'].includes(e.event)
                    && (e.event === 'initial:current-ready' || !e.fromSaved)), null, { timeout: 20000 });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const metrics = await page.evaluate(() => {
                const events = window.__githubPlanetPerfEvents;
                const resources = performance.getEntriesByType('resource');
                return {
                    firstVisibleMs: events.find(e => e.event === 'loadPlanet:planet-visible').timeMs,
                    firstSceneReadyMs: events.find(e => e.event === 'initial:scene-ready').timeMs,
                    currentReadyMs: events.find(e => e.event === 'initial:current-ready'
                        || (e.event === 'initial:scene-ready' && !e.fromSaved)).timeMs,
                    apiStartMs: resources.find(e => new URL(e.name).pathname === '/api/me')?.startTime,
                    firstFromSaved: events.find(e => e.event === 'initial:scene-ready').fromSaved
                };
            });
            assert.deepEqual(errors, []);
            assert.equal(server.requests() - count, 1, 'one full refresh per login');
            if (variant === 'after') assert.equal(metrics.firstFromSaved, true);
            if (iteration === 0) await page.screenshot({ path: path.join(out, `${variant}-current.png`) });
            if (iteration >= 0) results.push({ variant, iteration, ...metrics });
            console.log(JSON.stringify({ variant, iteration, firstVisibleMs: Math.round(metrics.firstVisibleMs), currentReadyMs: Math.round(metrics.currentReadyMs) }));
            await context.close();
        }
    }
    const checks = [];
    for (const scenario of ['new-user', 'preview-fails', 'refresh-fails', 'fast-current', 'language-changes', 'selection', 'mobile']) {
        const context = await browser.newContext({ viewport: scenario === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 720 }, serviceWorkers: 'block' });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => { localStorage.setItem('githubPlanetVisited', 'true'); window.__GITHUB_PLANET_PERF__ = true; });
        const currentResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/me');
        await page.goto(`${versions.after.baseUrl}/benchmark/login?scenario=${scenario}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__githubPlanetPerfEvents?.some(e => e.event === 'initial:scene-ready'));
        if (scenario === 'selection') {
            await page.getByRole('button', { name: '惑星を探す', exact: true }).click();
            page.once('dialog', dialog => dialog.accept('other-user'));
            await page.locator('#visit-user-btn').click();
            await page.waitForFunction(() => document.getElementById('planet-owner-display').textContent.includes('other-user'));
        }
        if (scenario === 'mobile') {
            const bounds = await page.locator('#planet-refresh-status').boundingBox();
            assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390, 'mobile update status fits the viewport');
            await page.screenshot({ path: path.join(out, 'after-mobile-updating.png') });
        }
        await (await currentResponse).finished();
        if (scenario === 'refresh-fails') {
            await page.waitForFunction(() => document.getElementById('planet-refresh-status').textContent === '保存済みのデータを表示中');
            assert.equal(await page.locator('#commit-count-val').textContent(), '4626');
        } else if (scenario === 'selection') {
            await page.waitForTimeout(300);
            assert.match(await page.locator('#planet-owner-display').textContent(), /other-user/);
        } else {
            await page.waitForFunction(() => document.getElementById('commit-count-val').textContent === '4629');
            assert.equal(await page.locator('#planet-refresh-status').isVisible(), false);
            const initial = await page.evaluate(() => window.__githubPlanetPerfEvents.find(e => e.event === 'initial:scene-ready'));
            if (['new-user', 'preview-fails', 'fast-current'].includes(scenario)) assert.equal(initial.fromSaved, false);
            if (scenario === 'language-changes') assert.match(await page.locator('#lang-stats-container').textContent(), /^JavaScript80%/);
            if (scenario === 'mobile') assert.equal(await page.evaluate(() => window.__githubPlanetPerfEvents.some(e => e.event === 'loadPlanet:scene-reused')), true);
        }
        assert.deepEqual(errors, []);
        checks.push({ scenario, passed: true });
        await context.close();
    }
    const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)];
    const summaries = samples ? Object.fromEntries(['before', 'after'].map(variant => [variant,
        Object.fromEntries(['firstVisibleMs', 'firstSceneReadyMs', 'currentReadyMs', 'apiStartMs'].map(key => {
            const values = results.filter(r => r.variant === variant).map(r => r[key]);
            const sorted = [...values].sort((a, b) => a - b);
            const median = (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
            return [key, { median, p95: percentile(values, .95), min: Math.min(...values), max: Math.max(...values) }];
        }))])) : {};
    const report = { baseline, samples, browser: browser.version(), viewport: '1280x720',
        environment: 'local only; in-memory session/repository; fixed refresh 4050ms, saved read 120ms; real Three.js/anime, software GPU; vendor modules served locally',
        summaries, results, checks };
    await writeFile(path.join(out, samples ? 'results.json' : 'checks.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(summaries, null, 2));
    console.log(JSON.stringify({ checks }, null, 2));
} finally {
    await browser.close();
    for (const { io, server } of Object.values(versions)) {
        await new Promise(resolve => io.close(resolve));
        if (server.listening) await new Promise(resolve => server.close(resolve));
    }
}
