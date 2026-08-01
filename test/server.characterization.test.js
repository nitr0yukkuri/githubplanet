import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import net from 'node:net';

let serverProcess;
let baseUrl;

function getAvailablePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close((error) => error ? reject(error) : resolve(port));
        });
    });
}

function waitForServer(process, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Server startup timed out')), timeoutMs);
        let output = '';

        const onData = (chunk) => {
            output += chunk.toString();
            if (output.includes('Server running on port')) {
                clearTimeout(timeout);
                resolve();
            }
        };

        process.stdout.on('data', onData);
        process.stderr.on('data', onData);
        process.once('exit', (code) => {
            clearTimeout(timeout);
            reject(new Error(`Server exited before startup with code ${code}: ${output}`));
        });
    });
}

before(async () => {
    const port = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = spawn(process.execPath, ['server.js'], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            PORT: String(port),
            DATABASE_URL: '',
            GEMINI_API_KEY: '',
            NODE_ENV: 'test',
            GITHUB_CLIENT_ID_LOCAL: 'characterization-client',
            GITHUB_CLIENT_SECRET_LOCAL: 'characterization-secret'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    await waitForServer(serverProcess);
});

after(() => {
    if (serverProcess && !serverProcess.killed) serverProcess.kill();
});

test('serves locale-correct source documents for Japanese and English home routes', async () => {
    const [japanese, english, englishAlias] = await Promise.all([
        fetch(`${baseUrl}/`),
        fetch(`${baseUrl}/en`),
        fetch(`${baseUrl}/english`)
    ]);

    assert.equal(japanese.status, 200);
    assert.equal(english.status, 200);
    assert.equal(englishAlias.status, 200);
    const japaneseHtml = await japanese.text();
    const englishHtml = await english.text();
    const englishAliasHtml = await englishAlias.text();

    assert.match(japaneseHtml, /<html lang="ja">/);
    assert.match(japaneseHtml, /GitHubの活動履歴から/);
    for (const html of [englishHtml, englishAliasHtml]) {
        assert.match(html, /<html lang="en">/);
        assert.match(html, /Generate your own planet from your GitHub activity\./);
        assert.match(html, /href="https:\/\/githubplanet-git-543426763451\.asia-northeast2\.run\.app\/en" rel="canonical"/);
        assert.doesNotMatch(html, /<meta name="description" content="GitHubの/);
    }

    assert.equal(english.headers.get('x-powered-by'), null);
    assert.equal(english.headers.get('x-content-type-options'), 'nosniff');
    assert.match(english.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
});

test('serves public pages and sender with their existing content types', async () => {
    for (const route of ['/achievements', '/en/achievements', '/settings', '/en/settings', '/sender']) {
        const response = await fetch(`${baseUrl}${route}`);
        assert.equal(response.status, 200, route);
        assert.match(response.headers.get('content-type') || '', /^text\/html/);
    }
});

test('keeps card access rules unchanged', async () => {
    const publicFixCard = await fetch(`${baseUrl}/en/card.html?username=tester&fix=true`);
    const localCard = await fetch(`${baseUrl}/card.html?username=tester`);
    const cardWithoutUsername = await fetch(`${baseUrl}/card.html`);
    const extensionlessCard = await fetch(`${baseUrl}/card?username=tester`);
    const extensionlessEnglishCard = await fetch(`${baseUrl}/en/card?username=tester`);
    const protectedCardApi = await fetch(`${baseUrl}/api/card/tester`, { redirect: 'manual' });

    assert.equal(publicFixCard.status, 200);
    assert.equal(localCard.status, 200);
    assert.equal(cardWithoutUsername.status, 200);
    assert.equal(extensionlessCard.status, 200);
    assert.equal(extensionlessEnglishCard.status, 200);
    assert.equal(protectedCardApi.status, 403);
    assert.equal(await protectedCardApi.text(), 'Forbidden: Please login first.');
    assert.equal(publicFixCard.headers.get('x-frame-options'), null);
    assert.match(
        publicFixCard.headers.get('content-security-policy') || '',
        /frame-ancestors 'self' https:\/\/wakato\.tech https:\/\/www\.wakato\.tech/
    );
});

test('keeps unauthenticated API responses unchanged', async () => {
    const me = await fetch(`${baseUrl}/api/me`);
    const saveTitle = await fetch(`${baseUrl}/api/save-title`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix: 'x', suffix: 'y' })
    });
    const planet = await fetch(`${baseUrl}/api/planets/user/tester`);
    const random = await fetch(`${baseUrl}/api/planets/random`);

    assert.equal(me.status, 401);
    assert.deepEqual(await me.json(), { error: 'Not logged in' });
    assert.equal(saveTitle.status, 401);
    assert.deepEqual(await saveTitle.json(), { error: 'Not logged in' });
    assert.equal(planet.status, 503);
    assert.deepEqual(await planet.json(), { error: 'DB unavailable' });
    assert.equal(random.status, 503);
    assert.deepEqual(await random.json(), { error: 'DB unavailable' });
});

test('serves deterministic showcase planets without a database', async () => {
    const showcase = await fetch(`${baseUrl}/api/planets/showcase/typescript`);
    const missing = await fetch(`${baseUrl}/api/planets/showcase/unknown`);

    assert.equal(showcase.status, 200);
    assert.deepEqual(await showcase.json(), {
        username: 'SHOWCASE_TYPESCRIPT',
        planetColor: '#007acc',
        planetSizeFactor: 2,
        mainLanguage: 'TypeScript',
        languageStats: { TypeScript: 100 },
        totalCommits: 2000,
        weeklyCommits: 24,
        planetName: 'Defensive Typed Shell',
        achievements: {},
        activeTitle: {
            prefix: 'LANGUAGE SHOWCASE',
            suffix: 'FEATURE PLANET'
        }
    });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'Showcase planet not found' });
});

test('preserves the English login route and callback validation', async () => {
    const login = await fetch(`${baseUrl}/en/login`, { redirect: 'manual' });
    assert.equal(login.status, 302);
    assert.match(login.headers.get('location') || '', /^https:\/\/github\.com\/login\/oauth\/authorize\?/);
    assert.match(login.headers.get('set-cookie') || '', /connect\.sid=/);

    const callback = await fetch(`${baseUrl}/callback`);
    assert.equal(callback.status, 400);
    assert.equal(await callback.text(), '不正なリクエストです');
});

test('acknowledges webhook payloads before asynchronous processing', async () => {
    const response = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repository: { language: 'JavaScript' }, commits: [] })
    });

    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'OK');
});

test('keeps manual meteor and debug endpoint responses unchanged', async () => {
    const meteor = await fetch(`${baseUrl}/api/meteor`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ language: 'C++', color: '#f34b7d', scale: 4 })
    });
    const color = await fetch(`${baseUrl}/api/debug-color/C%2B%2B`);
    const name = await fetch(`${baseUrl}/api/debug-name/C%2B%2B?color=%23f34b7d&commits=100`);

    assert.equal(meteor.status, 200);
    assert.deepEqual(await meteor.json(), { success: true, color: '#f34b7d' });
    assert.equal(color.status, 200);
    assert.deepEqual(await color.json(), {
        target_language: 'C++',
        generated_color: '#f34b7d'
    });
    assert.equal(name.status, 200);
    assert.deepEqual(await name.json(), {
        input_language: 'C++',
        input_color: '#f34b7d',
        generated_name: '生成失敗'
    });
});
