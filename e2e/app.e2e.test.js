import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, test } from 'node:test';
import axios from 'axios';
import express from 'express';
import session from 'express-session';
import { Server } from 'socket.io';
import { chromium } from 'playwright';
import { LANGUAGE_COLORS } from '../src/domain/planet/constants.js';
import { EXTENSION_MAP } from '../src/domain/planet/language-extensions.js';
import { requestPlanetName } from '../src/application/planet-name-generator.js';
import { getShowcasePlanet, listShowcasePlanets } from '../src/domain/planet/showcase-planets.js';
import { createMeteorService } from '../src/application/meteor-service.js';
import { createPlanetQueryService } from '../src/application/planet-query-service.js';
import { createPlanetService } from '../src/application/planet-service.js';
import { runDatabaseMigrations } from '../src/infrastructure/database/migrations.js';
import { createWebhookDeliveryStore } from '../src/infrastructure/database/webhook-delivery-store.js';
import { createPlanetRepository } from '../src/infrastructure/database/planet-repository.js';
import { createPostgresPool } from '../src/infrastructure/database/postgres.js';
import { createGithubClient } from '../src/infrastructure/external/github-client.js';
import { registerAuthRoutes } from '../src/presentation/http/auth-routes.js';
import { registerEventRoutes } from '../src/presentation/http/event-routes.js';
import { registerPageRoutes } from '../src/presentation/http/page-routes.js';
import { registerPlanetRoutes } from '../src/presentation/http/planet-routes.js';

const DATA_CACHE_DURATION = 60 * 60 * 1000;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E2E_DATABASE_NAME = 'githubplanet_e2e';
const E2E_SESSION_SECRET = 'isolated-e2e-session-secret';
const E2E_WEBHOOK_SECRET = 'isolated-e2e-webhook-secret';
const E2E_GITHUB_CLIENT_ID = 'e2e-github-client';
const E2E_GITHUB_CLIENT_SECRET = 'e2e-github-client-secret';
const E2E_ACCESS_TOKEN = 'e2e-github-access-token';

let pool;
let appServer;
let githubMockServer;
let sessionStore;
let browser;
let io;
let baseUrl;
let githubMockBaseUrl;
let callbackUrl;
let socketIoClientModule;
let oauthCodeSequence = 0;
const oauthChallenges = new Map();
const contexts = new Set();
const inMemoryWebhookDeliveries = new Set();

function assertSafeE2eDatabaseUrl(connectionString) {
    if (!connectionString) {
        throw new Error('Set E2E_DATABASE_URL to a disposable local PostgreSQL database named githubplanet_e2e.');
    }

    const parsed = new URL(connectionString);
    const databaseName = decodeURIComponent(parsed.pathname.slice(1));
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (!localHosts.has(parsed.hostname) || databaseName !== E2E_DATABASE_NAME) {
        throw new Error(
            `E2E_DATABASE_URL must point to localhost/${E2E_DATABASE_NAME}; refusing to use ${parsed.hostname}/${databaseName}.`
        );
    }
}

function listen(server) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve(server.address());
        });
    });
}

function closeServer(server) {
    if (!server?.listening) return Promise.resolve();
    return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
}

function githubUser() {
    return {
        id: 740_000_001,
        login: 'e2e-user',
        name: 'E2E User',
        avatar_url: 'https://avatars.example.invalid/e2e-user.png',
        created_at: '2014-01-01T00:00:00Z'
    };
}

function mockPlanetSource(operation) {
    if (operation === 'RepositoryData') {
        return {
            starredRepositories: { totalCount: 0 },
            repositories: {
                nodes: [{
                    isFork: false,
                    stargazerCount: 0,
                    languages: {
                        edges: [
                            { size: 70_000, node: { name: 'JavaScript', color: '#f0db4f' } },
                            { size: 20_000, node: { name: 'Python', color: '#306998' } },
                            { size: 10_000, node: { name: 'TypeScript', color: '#007acc' } }
                        ]
                    }
                }]
            },
            repositoriesContributedTo: { nodes: [] }
        };
    }
    if (operation === 'AnnualContributions') {
        return { contributionsCollection: { contributionCalendar: { totalContributions: 1 } } };
    }
    if (operation === 'MergedPullRequests') {
        return { pullRequests: { nodes: [] } };
    }
    return { contributionsCollection: { contributionCalendar: { weeks: [] } } };
}

async function startGithubMock() {
    const app = express();
    app.use(express.json());

    app.get('/login/oauth/authorize', (req, res) => {
        const {
            client_id: clientId,
            redirect_uri: redirectUri,
            state,
            code_challenge: codeChallenge,
            code_challenge_method: method
        } = req.query;
        if (clientId !== E2E_GITHUB_CLIENT_ID
            || method !== 'S256'
            || !/^[\da-f]{32}$/i.test(String(state || ''))
            || !/^[A-Za-z\d_-]{43}$/.test(String(codeChallenge || ''))) {
            return res.status(400).send('Invalid OAuth authorization request');
        }

        const redirect = new URL(redirectUri);
        if (redirect.origin !== new URL(baseUrl).origin || redirect.pathname !== '/callback') {
            return res.status(400).send('Unregistered OAuth callback');
        }

        const code = `e2e-oauth-${++oauthCodeSequence}`;
        oauthChallenges.set(code, String(codeChallenge));
        redirect.searchParams.set('code', code);
        redirect.searchParams.set('state', String(state));
        res.redirect(302, redirect.href);
    });

    app.post('/login/oauth/access_token', (req, res) => {
        const { client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier } = req.body || {};
        const expectedChallenge = oauthChallenges.get(code);
        oauthChallenges.delete(code);
        const actualChallenge = typeof verifier === 'string'
            ? crypto.createHash('sha256').update(verifier).digest('base64url')
            : '';
        if (clientId !== E2E_GITHUB_CLIENT_ID
            || clientSecret !== E2E_GITHUB_CLIENT_SECRET
            || !expectedChallenge
            || actualChallenge !== expectedChallenge) {
            return res.status(400).json({ error: 'invalid_grant' });
        }
        res.json({ access_token: E2E_ACCESS_TOKEN, token_type: 'bearer', scope: 'read:user' });
    });

    app.get('/user', (req, res) => {
        if (req.get('authorization') !== `Bearer ${E2E_ACCESS_TOKEN}`) {
            return res.status(401).json({ message: 'Bad credentials' });
        }
        res.json(githubUser());
    });

    app.get('/users/:login', (req, res) => {
        if (req.params.login.toLowerCase() !== 'e2e-user') {
            return res.status(404).json({ message: 'Not Found' });
        }
        res.json(githubUser());
    });

    app.get('/users/:login/repos', (_req, res) => {
        res.json([{
            owner: { login: 'nitr0yukkuri' },
            language: 'Python',
            size: 100,
            fork: false,
            stargazers_count: 1
        }]);
    });

    app.post('/graphql', (req, res) => {
        const operation = String(req.body?.query || '').match(/query (\w+)/)?.[1];
        if (!operation) return res.status(400).json({ errors: [{ message: 'Missing GraphQL operation' }] });
        res.json({ data: { user: mockPlanetSource(operation) } });
    });

    githubMockServer = http.createServer(app);
    const address = await listen(githubMockServer);
    githubMockBaseUrl = `http://127.0.0.1:${address.port}`;
}

async function startApp() {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({
        verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); }
    }));

    sessionStore = new session.MemoryStore();
    app.use(session({
        name: 'connect.sid',
        store: sessionStore,
        secret: E2E_SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: 'lax' }
    }));

    app.use('/front', express.static(path.join(projectRoot, 'front')));
    app.get('/vendor/three/build/three.module.js', (_req, res) => {
        res.sendFile(path.join(projectRoot, 'node_modules/three/build/three.module.js'));
    });
    app.get('/vendor/three/examples/jsm/controls/OrbitControls.js', (_req, res) => {
        res.sendFile(path.join(projectRoot, 'node_modules/three/examples/jsm/controls/OrbitControls.js'));
    });

    appServer = http.createServer(app);
    const address = await listen(appServer);
    baseUrl = `http://127.0.0.1:${address.port}`;
    callbackUrl = `${baseUrl}/callback`;

    const githubClient = createGithubClient({
        axios,
        clientId: E2E_GITHUB_CLIENT_ID,
        clientSecret: E2E_GITHUB_CLIENT_SECRET,
        callbackUrl,
        githubApiBaseUrl: githubMockBaseUrl,
        githubOAuthBaseUrl: githubMockBaseUrl
    });
    const repository = pool ? createPlanetRepository(pool, { randomQueryStrategy: 'legacy' }) : undefined;
    const geminiClient = {
        async ask() { return null; }
    };
    const languageColorService = {
        async resolveLanguageColor(language) { return LANGUAGE_COLORS[language] || '#808080'; }
    };
    const planetService = createPlanetService({
        repository,
        githubClient,
        geminiClient,
        languageColorService,
        geminiApiKey: ''
    });
    const planetQueryService = repository
        ? createPlanetQueryService({
            repository,
            githubClient,
            planetService,
            cacheDuration: DATA_CACHE_DURATION
        })
        : {
            async getByUsername(username) {
                if (username.toLowerCase() !== 'nitr0yukkuri') return null;
                return {
                    username: 'nitr0yukkuri',
                    planetColor: '#306998',
                    planetSizeFactor: 1.3,
                    mainLanguage: 'Python',
                    languageStats: { Python: 70, Rust: 20, TypeScript: 10 },
                    totalCommits: 2000,
                    weeklyCommits: 24,
                    planetName: 'Deterministic Public Preview',
                    achievements: {},
                    activeTitle: { prefix: '名もなき', suffix: '旅人' }
                };
            },
            async saveActiveTitle() { return false; }
        };

    let meteorIo;
    const meteorService = createMeteorService({
        languageColorService,
        extensionMap: EXTENSION_MAP,
        emitMeteor: (payload) => meteorIo?.emit('meteor', payload),
        logger: { log() {}, error() {}, warn() {} }
    });

    registerPageRoutes(app, {
        rootDirectory: projectRoot,
        isProduction: true,
        systemApiKey: 'isolated-e2e-system-key',
        sessionSecret: E2E_SESSION_SECRET,
        publicBaseUrl: baseUrl,
        cardCaptureBaseUrl: baseUrl,
        showcasePages: listShowcasePlanets()
    });
    registerAuthRoutes(app, {
        githubClient,
        planetService,
        clientId: E2E_GITHUB_CLIENT_ID,
        callbackUrl,
        sessionCookieName: 'connect.sid',
        authorizationUrl: `${githubMockBaseUrl}/login/oauth/authorize`,
        logger: { error() {}, warn() {} }
    });
    registerPlanetRoutes(app, {
        planetService,
        planetQueryService,
        cacheDuration: DATA_CACHE_DURATION
    });
    registerEventRoutes(app, {
        generatePlanetName: (input) => requestPlanetName(geminiClient.ask, input),
        geminiClient,
        languageColorService,
        meteorService,
        systemApiKey: 'isolated-e2e-system-key',
        webhookSecret: E2E_WEBHOOK_SECRET,
        webhookDeliveryStore: (pool && createWebhookDeliveryStore(pool)) || {
            async claimGithubWebhookDelivery(deliveryId) {
                if (inMemoryWebhookDeliveries.has(deliveryId)) return false;
                inMemoryWebhookDeliveries.add(deliveryId);
                return true;
            }
        },
        requireInternalAuth: true,
        requireWebhookSignature: true
    });

    io = new Server(appServer, { cors: { origin: baseUrl } });
    meteorIo = io;
}

function createAnimeTestModule() {
    // CDNの演出ライブラリだけを固定し、実際のDOM・Three.js・Socket.IO経路を検証する。
    return `
        function apply(options = {}) {
            options.begin?.();
            const targets = Array.isArray(options.targets) ? options.targets : [options.targets];
            for (const target of targets) {
                if (!target || typeof target !== 'object') continue;
                for (const [key, value] of Object.entries(options)) {
                    if (['targets', 'begin', 'update', 'complete', 'duration', 'delay', 'easing'].includes(key)) continue;
                    target[key] = Array.isArray(value) ? value.at(-1)?.value ?? value.at(-1) : value;
                }
            }
            options.update?.({ progress: 100 });
            const duration = Math.max(0, Number(options.duration) || 0);
            if (options.complete) window.setTimeout(options.complete, Math.min(duration, 1500));
            return { pause() {}, play() {}, restart() {} };
        }
        function anime(options) { return apply(options); }
        anime.timeline = (settings = {}) => {
            let completionAt = 0;
            const timeline = {
                add(options, offset = 0) {
                    const startAt = Math.max(0, Number(offset) || 0);
                    const duration = Math.max(0, Number(options.duration) || 0);
                    window.setTimeout(() => apply({ ...options, complete: undefined }), startAt);
                    completionAt = Math.max(completionAt, startAt + duration);
                    if (settings.complete) {
                        window.clearTimeout(timeline.completionTimer);
                        timeline.completionTimer = window.setTimeout(settings.complete, Math.min(completionAt, 1500));
                    }
                    return timeline;
                },
                pause() {},
                play() { return timeline; },
                completionTimer: null
            };
            return timeline;
        };
        export default anime;
    `;
}

async function resolveBrowserModule(url) {
    if (url.startsWith('https://cdn.jsdelivr.net/npm/animejs@')) {
        return { contentType: 'text/javascript; charset=utf-8', body: createAnimeTestModule() };
    }
    if (url.startsWith('https://cdn.jsdelivr.net/npm/socket.io-client@')) {
        return { contentType: 'text/javascript; charset=utf-8', body: socketIoClientModule };
    }

    const match = new URL(url).pathname.match(/^\/npm\/(three)@[^/]+\/(.+)$/);
    if (!match) return null;
    const [, packageName, relativePath] = match;
    const packageRoot = path.join(projectRoot, 'node_modules', packageName);
    const resolvedPath = path.resolve(packageRoot, relativePath);
    if (!resolvedPath.startsWith(`${packageRoot}${path.sep}`)) return null;

    try {
        return {
            contentType: 'text/javascript; charset=utf-8',
            body: await fs.readFile(resolvedPath, 'utf8')
        };
    } catch {
        return null;
    }
}

async function proxyLocalHttpRequest(route) {
    const request = route.request();
    const headers = { ...request.headers() };
    for (const header of ['host', 'connection', 'content-length', 'accept-encoding']) delete headers[header];
    const method = request.method();
    const body = ['GET', 'HEAD'].includes(method) ? undefined : request.postDataBuffer();
    const upstream = await fetch(request.url(), { method, headers, body, redirect: 'manual' });
    const responseHeaders = Object.fromEntries(upstream.headers.entries());
    for (const header of ['content-encoding', 'content-length', 'transfer-encoding', 'connection']) {
        delete responseHeaders[header];
    }
    let responseBody = Buffer.from(await upstream.arrayBuffer());
    if (new URL(request.url()).pathname === '/front/js/home.js') {
        const source = responseBody.toString('utf8');
        assert.match(source, /transports: \['websocket', 'polling'\]/);
        // The isolated browser runner cannot open raw sockets; use Socket.IO's real HTTP polling transport.
        responseBody = Buffer.from(source.replace(
            "transports: ['websocket', 'polling']",
            "transports: ['polling', 'websocket']"
        ));
    }
    return route.fulfill({
        status: upstream.status,
        headers: responseHeaders,
        body: responseBody
    });
}

async function openPage({ viewport = { width: 1280, height: 900 }, reducedMotion = 'no-preference' } = {}) {
    const context = await browser.newContext({ viewport, reducedMotion, serviceWorkers: 'block' });
    contexts.add(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await page.addInitScript(() => localStorage.clear());
    await page.route('**/*', async (route) => {
        const requestUrl = route.request().url();
        const origin = new URL(requestUrl).origin;
        if (origin === baseUrl || origin === githubMockBaseUrl) {
            return proxyLocalHttpRequest(route);
        }

        const module = await resolveBrowserModule(requestUrl);
        if (module) return route.fulfill({ status: 200, ...module });
        return route.abort('blockedbyclient');
    });

    return {
        page,
        context,
        async close() {
            contexts.delete(context);
            await context.close();
        },
        assertNoPageErrors() {
            assert.deepEqual(pageErrors.map((error) => error.message), [], 'browser should not raise uncaught JavaScript errors');
        }
    };
}

async function login(page) {
    await page.goto(`${baseUrl}/login`);
    await page.waitForURL(`${baseUrl}/`);
    const meResponse = await page.request.get(`${baseUrl}/api/me`);
    assert.equal(meResponse.status(), 200, 'OAuth callback should establish a session used by /api/me');
    const me = await meResponse.json();
    assert.equal(me.user.login, 'e2e-user');
    assert.ok(me.planetData, 'first authenticated /api/me should create and return planet data');
}

async function resetTestDatabase() {
    if (pool) await pool.query('TRUNCATE TABLE planets, "session", github_webhook_deliveries CASCADE');
    await new Promise((resolve, reject) => {
        sessionStore.clear((error) => error ? reject(error) : resolve());
    });
    oauthChallenges.clear();
    inMemoryWebhookDeliveries.clear();
}

before(async () => {
    const databaseUrl = process.env.E2E_DATABASE_URL;
    if (databaseUrl) {
        assertSafeE2eDatabaseUrl(databaseUrl);
        pool = createPostgresPool(databaseUrl, { max: 10, queryTimeout: 15_000, statementTimeout: 15_000 });
        await runDatabaseMigrations(pool, { logger: { log() {}, warn() {} } });
    }

    await startGithubMock();
    await startApp();

    const socketClientPath = path.join(projectRoot, 'node_modules/socket.io/client-dist/socket.io.esm.min.js');
    socketIoClientModule = await fs.readFile(socketClientPath, 'utf8');
    const launchOptions = {
        headless: true,
        args: ['--enable-webgl', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader']
    };
    const installedChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    if (process.env.E2E_CHROMIUM_CHANNEL) {
        launchOptions.channel = process.env.E2E_CHROMIUM_CHANNEL;
    } else if (process.platform === 'win32' && fsSync.existsSync(installedChrome)) {
        launchOptions.channel = 'chrome';
    }
    browser = await chromium.launch(launchOptions);
}, { timeout: 60_000 });

beforeEach(async () => {
    await resetTestDatabase();
}, { timeout: 30_000 });

after(async () => {
    await Promise.all([...contexts].map((context) => context.close().catch(() => undefined)));
    await browser?.close();
    io?.close();
    await Promise.all([closeServer(appServer), closeServer(githubMockServer)]);
    await pool?.end();
});

test('shared Markdown opens the card in a clean anonymous browser without a 403', { timeout: 60_000 }, async () => {
    const firstBrowser = await openPage();
    const anonymousBrowser = await openPage();
    try {
        const markdownPageResponse = await firstBrowser.page.goto(`${baseUrl}/card.html`);
        assert.equal(markdownPageResponse.status(), 200);
        await firstBrowser.page.locator('#markdown-code').waitFor({ state: 'visible' });
        await firstBrowser.page.waitForFunction(() => (
            document.getElementById('username-display')?.textContent === 'nitr0yukkuri'
        ));

        const markdown = (await firstBrowser.page.locator('#markdown-code').textContent()).trim();
        const match = markdown.match(/^\[!\[[^\]]*\]\([^)]*\)\]\((https:\/\/[^)]+)\)$/);
        assert.ok(match, `expected a profile-card Markdown link, got: ${markdown}`);
        const publicUrl = new URL(match[1]);
        assert.equal(publicUrl.hostname, 'githubplanet.dev');
        assert.equal(publicUrl.pathname, '/card.html');
        assert.equal(publicUrl.searchParams.get('fix'), 'true');

        // Markdownには本番URLが入るため、同じパスを隔離したローカル本番相当サーバーで開く。
        const anonymousResponse = await anonymousBrowser.page.goto(
            `${baseUrl}${publicUrl.pathname}${publicUrl.search}`
        );
        assert.equal(anonymousResponse.status(), 200, 'the public screenshot URL must not be forbidden');
        await anonymousBrowser.page.waitForFunction(() => (
            document.getElementById('main-lang-stat')?.textContent === 'PYTHON'
        ));
        assert.equal(await anonymousBrowser.page.locator('#share-section').isVisible(), false);
        assert.equal(await anonymousBrowser.page.locator('#planet-canvas canvas').count(), 1);
        firstBrowser.assertNoPageErrors();
        anonymousBrowser.assertNoPageErrors();
    } finally {
        await Promise.all([firstBrowser.close(), anonymousBrowser.close()]);
    }
});

test('showcase cards render without WebGL fallback and shared trail shader time advances', { timeout: 180_000 }, async () => {
    const { page, close, assertNoPageErrors } = await openPage();
    await page.addInitScript(() => {
        window.__e2eTrailShaderSeen = false;
        window.__e2eTrailTimes = [];
        for (const ContextType of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
            const prototype = ContextType?.prototype;
            if (!prototype || prototype.__e2eTrailTracking) continue;
            Object.defineProperty(prototype, '__e2eTrailTracking', { value: true });
            const originalShaderSource = prototype.shaderSource;
            if (originalShaderSource) {
                prototype.shaderSource = function (shader, source) {
                    if (String(source).includes('trailTime')) window.__e2eTrailShaderSeen = true;
                    return originalShaderSource.call(this, shader, source);
                };
            }
            const originalGetUniformLocation = prototype.getUniformLocation;
            const originalUniform1f = prototype.uniform1f;
            if (originalGetUniformLocation && originalUniform1f) {
                prototype.getUniformLocation = function (program, name) {
                    const location = originalGetUniformLocation.call(this, program, name);
                    if (name === 'trailTime' && location) {
                        (window.__e2eTrailLocations ||= []).push(location);
                    }
                    return location;
                };
                prototype.uniform1f = function (location, value) {
                    if (window.__e2eTrailLocations?.includes(location)) window.__e2eTrailTimes.push(value);
                    return originalUniform1f.call(this, location, value);
                };
            }
        }
    });

    try {
        for (const showcase of listShowcasePlanets()) {
            const response = await page.goto(`${baseUrl}/card.html?showcase=${encodeURIComponent(showcase.slug)}&fix=true`, {
                waitUntil: 'domcontentloaded'
            });
            assert.equal(response.status(), 200, showcase.slug);
            await page.waitForFunction(({ username, language }) => (
                document.getElementById('username-display')?.textContent === username.toUpperCase()
                && document.getElementById('main-lang-stat')?.textContent === language.toUpperCase()
                && document.getElementById('planet-name-sub')?.textContent !== 'UNKNOWN PLANET'
                && document.getElementById('commits-val')?.textContent === '2000'
            ), { username: showcase.username, language: showcase.mainLanguage });
            assert.equal(await page.locator('#planet-canvas canvas').count(), 1, `${showcase.slug}: canvas should be present`);
            assert.equal(await page.locator('#card-webgl-fallback').isVisible(), false, `${showcase.slug}: WebGL should be active`);
        }

        // 専用演出のない言語でも、共通軌跡のシェーダーのコンパイルと時間更新を確認する。
        await page.route(`${baseUrl}/api/planets/user/e2e-trails`, (route) => route.fulfill({
            json: {
                username: 'e2e-trails',
                planetColor: '#306998',
                planetSizeFactor: 2,
                mainLanguage: 'Python',
                languageStats: { Python: 70, Rust: 20, TypeScript: 10 },
                totalCommits: 2000,
                weeklyCommits: 24,
                planetName: 'Shared Language Trails'
            }
        }));
        await page.goto(`${baseUrl}/card.html?username=e2e-trails&fix=true`);
        await page.waitForFunction(() => document.getElementById('main-lang-stat')?.textContent === 'PYTHON');
        assert.equal(await page.locator('#card-webgl-fallback').isVisible(), false);
        assert.equal(await page.locator('#card-container').getAttribute('data-card-theme'), null);
        await page.waitForFunction(() => (
            window.__e2eTrailShaderSeen
            && new Set(window.__e2eTrailTimes).size > 1
        ), { timeout: 15_000 });
        assertNoPageErrors();
    } finally {
        await close();
    }
});

test('Japanese and English mobile showcases fit the viewport and display the fixed planet data', { timeout: 60_000 }, async () => {
    const { page, close, assertNoPageErrors } = await openPage({ viewport: { width: 390, height: 844 } });
    try {
        await page.route((url) => url.pathname === '/api/planets/showcase/typescript', (route) => route.fulfill({
            json: {
                ...getShowcasePlanet('typescript'),
                languageStats: { TypeScript: 70, Rust: 20, Python: 10 }
            }
        }));
        for (const [route, language] of [['/showcase/typescript', 'ja'], ['/en/showcase/typescript', 'en']]) {
            const response = await page.goto(`${baseUrl}${route}`);
            assert.equal(response.status(), 200);
            await page.waitForFunction(() => (
                document.getElementById('planet-name-val')?.textContent.trim().length > 0
                && document.querySelectorAll('#lang-stats-container p').length === 3
            ));
            assert.equal(await page.locator('html').getAttribute('lang'), language);
            assert.equal(await page.locator('#planet-name-val').isVisible(), true);
            assert.equal(await page.locator('#canvas-container canvas').isVisible(), true);
            assert.equal(await page.locator('#webgl-fallback').isVisible(), false);
            assert.deepEqual(
                await page.locator('#lang-stats-container p').allTextContents(),
                ['TypeScript70%', 'Rust20%', 'Python10%']
            );
            const dimensions = await page.evaluate(() => ({
                viewport: document.documentElement.clientWidth,
                content: document.documentElement.scrollWidth
            }));
            assert.ok(dimensions.content <= dimensions.viewport, `${route} should not overflow horizontally: ${JSON.stringify(dimensions)}`);
        }
        assertNoPageErrors();
    } finally {
        await close();
    }
});

test('OAuth callback establishes a session and /api/me returns the authenticated planet', { timeout: 60_000 }, async () => {
    const { page, close, assertNoPageErrors } = await openPage();
    try {
        await login(page);
        assertNoPageErrors();
    } finally {
        await close();
    }
});

test('a saved title survives reload and OAuth re-login from PostgreSQL', {
    skip: !process.env.E2E_DATABASE_URL,
    timeout: 90_000
}, async () => {
    const firstBrowser = await openPage();
    const secondBrowser = await openPage();
    try {
        await login(firstBrowser.page);
        await firstBrowser.page.goto(`${baseUrl}/settings`);
        await firstBrowser.page.locator('#prefix-select option[value="始まりの"]').waitFor({ state: 'attached' });
        await firstBrowser.page.locator('#suffix-select option[value="創造主"]').waitFor({ state: 'attached' });
        await firstBrowser.page.locator('#prefix-select').selectOption('始まりの');
        await firstBrowser.page.locator('#suffix-select').selectOption('創造主');

        const saveResponse = firstBrowser.page.waitForResponse((response) => (
            response.url().endsWith('/api/save-title')
        ));
        // clickは遷移完了まで待つため、同期アラートを別のPromiseで先に閉じる。
        const alertAccepted = firstBrowser.page.waitForEvent('dialog').then((dialog) => dialog.accept());
        await Promise.all([firstBrowser.page.locator('#save-btn').click(), alertAccepted]);
        assert.equal((await saveResponse).status(), 200);

        const storedTitle = await pool.query('SELECT active_title FROM planets WHERE github_id = $1', [githubUser().id]);
        assert.deepEqual(storedTitle.rows[0].active_title, { prefix: '始まりの', suffix: '創造主' });

        await firstBrowser.page.reload();
        await firstBrowser.page.locator('#prefix-select option[value="始まりの"]').waitFor({ state: 'attached' });
        assert.equal(await firstBrowser.page.locator('#prefix-select').inputValue(), '始まりの');
        assert.equal(await firstBrowser.page.locator('#suffix-select').inputValue(), '創造主');

        // 別セッションでOAuthをやり直し、DBから称号が復元されることも確認する。
        await login(secondBrowser.page);
        await secondBrowser.page.goto(`${baseUrl}/settings`);
        await secondBrowser.page.locator('#prefix-select option[value="始まりの"]').waitFor({ state: 'attached' });
        assert.equal(await secondBrowser.page.locator('#prefix-select').inputValue(), '始まりの');
        assert.equal(await secondBrowser.page.locator('#suffix-select').inputValue(), '創造主');

        firstBrowser.assertNoPageErrors();
        secondBrowser.assertNoPageErrors();
    } finally {
        await Promise.all([firstBrowser.close(), secondBrowser.close()]);
    }
});

test('a signed GitHub webhook reaches the other browser over live Socket.IO', { timeout: 60_000 }, async () => {
    const receiver = await openPage();
    const sender = await openPage();
    const receiverMessages = [];
    receiver.page.on('console', (message) => {
        if (message.type() === 'log' && message.text().startsWith('Meteor received:')) {
            receiverMessages.push(message.text());
        }
    });

    try {
        const receiverConnected = receiver.page.waitForEvent('console', {
            predicate: (message) => message.text().startsWith('Realtime meteor connected'),
            timeout: 15_000
        });
        const senderConnected = sender.page.waitForEvent('console', {
            predicate: (message) => message.text().startsWith('Realtime meteor connected'),
            timeout: 15_000
        });
        await receiver.page.goto(`${baseUrl}/showcase/go`);
        await sender.page.goto(`${baseUrl}/showcase/typescript`);
        await Promise.all([receiverConnected, senderConnected]);

        const deliveryId = '123e4567-e89b-12d3-a456-426614174777';
        const payload = {
            repository: { language: 'JavaScript' },
            commits: [{ id: 'e2e123456789', total_lines: 12, added: [], modified: ['src/app.js'] }]
        };
        const receivedMeteor = receiver.page.waitForEvent('console', {
            predicate: (message) => message.text().startsWith('Meteor received:'),
            timeout: 8_000
        });
        const response = await sender.page.evaluate(async ({ payload, deliveryId, secret }) => {
            const body = JSON.stringify(payload);
            const key = await crypto.subtle.importKey(
                'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
            );
            const signatureBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
            const signature = [...signatureBytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
            const result = await fetch('/webhook', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-hub-signature-256': `sha256=${signature}`,
                    'x-github-delivery': deliveryId
                },
                body
            });
            return { status: result.status, body: await result.text() };
        }, { payload, deliveryId, secret: E2E_WEBHOOK_SECRET });

        assert.deepEqual(response, { status: 200, body: 'OK' });
        await receivedMeteor;
        assert.equal(receiverMessages.length, 1, 'the other browser should handle the pushed meteor event');
        assert.match(receiverMessages[0], /JavaScript/);
        sender.assertNoPageErrors();
        receiver.assertNoPageErrors();
    } finally {
        await Promise.all([sender.close(), receiver.close()]);
    }
});

test('XML surface compiles and animates in both home and card', { timeout: 60_000 }, async (t) => {
    const { page, close, assertNoPageErrors } = await openPage();
    const shaderErrors = [];
    page.on('console', (message) => {
        if (message.type() === 'error' && /WebGLProgram|VALIDATE_STATUS|shader error/i.test(message.text())) {
            shaderErrors.push(message.text());
        }
    });
    await page.addInitScript(() => {
        window.__xmlTimes = [];
        const prototype = window.WebGL2RenderingContext?.prototype;
        if (!prototype) return;
        const locations = new Set();
        const getLocation = prototype.getUniformLocation;
        const setFloat = prototype.uniform1f;
        prototype.getUniformLocation = function (program, name) {
            const location = getLocation.call(this, program, name);
            if (name === 'xmlNestingTime' && location) locations.add(location);
            return location;
        };
        prototype.uniform1f = function (location, value) {
            if (locations.has(location)) window.__xmlTimes.push(value);
            return setFloat.call(this, location, value);
        };
    });
    const fixture = {
        username: 'e2e-xml', mainLanguage: 'XML', planetColor: '#285a76',
        planetSizeFactor: 2, languageStats: { XML: 70, TypeScript: 20, Rust: 10 },
        totalCommits: 2000, weeklyCommits: 24, planetName: 'XML Integration Fixture'
    };
    await page.route((url) => ['/api/planets/showcase/typescript', '/api/planets/user/e2e-xml'].includes(url.pathname),
        (route) => route.fulfill({ json: fixture }));
    try {
        for (const pathname of ['/showcase/typescript', '/card.html?username=e2e-xml&fix=true']) {
            await page.goto(baseUrl + pathname);
            await page.waitForFunction(() => new Set(window.__xmlTimes).size > 1);
            if (pathname.startsWith('/card')) {
                assert.equal(await page.locator('#main-lang-stat').textContent(), 'XML');
                assert.equal(await page.locator('#card-webgl-fallback').isVisible(), false);
            }
            assert.deepEqual(shaderErrors, [], 'XML shader must link successfully');
            assertNoPageErrors();
        }
        const revision = await page.evaluate(async () => (await import('/vendor/three/build/three.module.js')).REVISION);
        t.diagnostic(`XML home/card rendered with Three revision ${revision}`);
    } finally {
        await close();
    }
});
