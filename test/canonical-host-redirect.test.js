import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createCanonicalHostRedirect } from '../src/presentation/http/canonical-host-redirect.js';

async function withRedirectServer(callback) {
    const app = express();
    app.set('trust proxy', 1);
    app.use(createCanonicalHostRedirect({
        publicBaseUrl: 'https://githubplanet.dev/',
        isProduction: true
    }));
    app.all('*', (req, res) => res.status(200).send('handled'));

    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });

    try {
        const address = server.address();
        await callback(`http://127.0.0.1:${address.port}`);
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
}

test('redirects known public URL aliases to the canonical host and preserves the request URL', async () => {
    await withRedirectServer(async (baseUrl) => {
        for (const host of [
            'githubplanet.onrender.com',
            'www.githubplanet.dev',
            'githubplanet-git-543426763451.asia-northeast2.run.app'
        ]) {
            const response = await fetch(`${baseUrl}/en/login?from=planet&return=%2Fhome`, {
                headers: { 'x-forwarded-host': host },
                redirect: 'manual'
            });
            assert.equal(response.status, 301, host);
            assert.equal(
                response.headers.get('location'),
                'https://githubplanet.dev/en/login?from=planet&return=%2Fhome',
                host
            );
        }
    });
});

test('does not redirect Firebase rewrites when the forwarded host is already canonical', async () => {
    await withRedirectServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/login`, {
            headers: {
                host: 'githubplanet-git-543426763451.asia-northeast2.run.app',
                'x-forwarded-host': 'githubplanet.dev'
            },
            redirect: 'manual'
        });

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('location'), null);
        assert.equal(await response.text(), 'handled');
    });
});

test('canonical requests remain stable, while non-safe methods and unknown hosts are not redirected', async () => {
    await withRedirectServer(async (baseUrl) => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const response = await fetch(`${baseUrl}/en/login?from=planet`, {
                headers: { 'x-forwarded-host': 'githubplanet.dev' },
                redirect: 'manual'
            });
            assert.equal(response.status, 200);
            assert.equal(await response.text(), 'handled');
        }

        const post = await fetch(`${baseUrl}/webhook`, {
            method: 'POST',
            headers: { 'x-forwarded-host': 'githubplanet.onrender.com' },
            body: 'payload',
            redirect: 'manual'
        });
        assert.equal(post.status, 200);

        const spoofed = await fetch(`${baseUrl}/`, {
            headers: { 'x-forwarded-host': 'githubplanet.onrender.com.attacker.example' },
            redirect: 'manual'
        });
        assert.equal(spoofed.status, 200);
    });
});
