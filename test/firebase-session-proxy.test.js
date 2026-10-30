import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import session from 'express-session';
import { registerAuthRoutes } from '../src/presentation/http/auth-routes.js';
import { registerPlanetRoutes } from '../src/presentation/http/planet-routes.js';
import { createCanonicalHostRedirect } from '../src/presentation/http/canonical-host-redirect.js';
import { createSessionCookieOptions } from '../src/presentation/http/session-cookie-options.js';

test('OAuth and authenticated API survive Hosting-style cookie filtering and forwarded host', { timeout: 15000 }, async () => {
    const app = express();
    const user = { id: 42, login: 'proxy-fixture' };
    const planet = { username: user.login, mainLanguage: 'TypeScript', languageStats: { TypeScript: 100 }, totalCommits: 123 };
    const seenCookies = [];
    let backendOrigin;
    const proxy = http.createServer(async (req, res) => {
        try {
            const cookies = String(req.headers.cookie || '').split(';').map((item) => item.trim())
                .filter((item) => item.startsWith('__session=')).join('; ');
            const upstream = await fetch(backendOrigin + req.url, { redirect: 'manual', headers: {
                Host: 'githubplanet-fixture.a.run.app', 'x-forwarded-host': 'planet.fixture.test',
                'x-forwarded-proto': 'https', ...(cookies ? { cookie: cookies } : {})
            } });
            res.statusCode = upstream.status;
            for (const [name, value] of upstream.headers) {
                if (!['transfer-encoding', 'content-encoding', 'content-length', 'set-cookie'].includes(name)) res.setHeader(name, value);
            }
            const setCookie = upstream.headers.getSetCookie();
            if (setCookie.length) res.setHeader('set-cookie', setCookie);
            res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch { res.writeHead(502).end(); }
    });
    proxy.listen(0, '127.0.0.1');
    await once(proxy, 'listening');
    const proxyOrigin = `http://127.0.0.1:${proxy.address().port}`;
    const cookieOptions = createSessionCookieOptions(true);
    app.set('trust proxy', 1);
    app.use(createCanonicalHostRedirect({ publicBaseUrl: 'https://planet.fixture.test', isProduction: true }));
    app.use((req, _res, next) => { seenCookies.push(req.headers.cookie || ''); next(); });
    app.use(session({ ...cookieOptions, secret: 'firebase-proxy-fixture-secret', resave: false, saveUninitialized: false }));
    registerAuthRoutes(app, { clientId: 'fixture-client', callbackUrl: 'https://planet.fixture.test/callback',
        sessionCookieName: cookieOptions.name, logger: { warn() {}, error() {} },
        githubClient: {
            async exchangeCode(code, verifier) { assert.equal(code, 'fixture-code'); assert.ok(verifier); return 'fixture-token'; },
            async getAuthenticatedUser(token) { assert.equal(token, 'fixture-token'); return user; }
        }, planetService: {} });
    registerPlanetRoutes(app, { cacheDuration: 60000, planetService: {
        async refreshAuthenticatedUser() { return user; },
        async updateAndSavePlanetData() { return planet; },
        async recordLoginProgress() { return {}; }
    } });
    const backend = app.listen(0, '127.0.0.1');
    await once(backend, 'listening');
    backendOrigin = `http://127.0.0.1:${backend.address().port}`;
    try {
        const login = await fetch(proxyOrigin + '/en/login', { redirect: 'manual' });
        assert.equal(login.status, 302, 'forwarded canonical host must not redirect back to the origin');
        const authUrl = new URL(login.headers.get('location'));
        const state = authUrl.searchParams.get('state');
        const cookie = login.headers.getSetCookie()[0];
        assert.match(cookie, /^__session=/);
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /Secure/);
        assert.match(cookie, /SameSite=Lax/);
        await login.arrayBuffer();
        const cookieHeader = cookie.split(';')[0] + '; connect.sid=discarded; tracking=discarded';
        const callback = await fetch(`${proxyOrigin}/callback?code=fixture-code&state=${state}`, {
            redirect: 'manual', headers: { cookie: cookieHeader }
        });
        assert.equal(callback.status, 302);
        assert.equal(callback.headers.get('location'), '/en');
        await callback.arrayBuffer();
        const api = await fetch(proxyOrigin + '/api/me', { headers: { cookie: cookieHeader } });
        assert.equal(api.status, 200);
        const data = await api.json();
        assert.equal(data.user.id, 42);
        assert.equal(data.planetData.totalCommits, 123);
        assert.ok(seenCookies.some((value) => value.startsWith('__session=')));
        assert.ok(seenCookies.every((value) => !value.includes('tracking') && !value.includes('connect.sid')));
    } finally {
        proxy.closeAllConnections(); backend.closeAllConnections();
        await Promise.all([new Promise((resolve) => proxy.close(resolve)), new Promise((resolve) => backend.close(resolve))]);
    }
});
