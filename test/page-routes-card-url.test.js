import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { registerPageRoutes } from '../src/presentation/http/page-routes.js';

test('uses the configured canonical origin for production card captures', async (t) => {
    const app = express();
    app.use((req, res, next) => {
        req.session = { planetData: { user: { login: 'tester' } } };
        next();
    });
    registerPageRoutes(app, {
        rootDirectory: process.cwd(),
        isProduction: true,
        systemApiKey: 'test-api-key',
        sessionSecret: 'test-session-secret',
        publicBaseUrl: 'https://githubplanet.dev'
    });

    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => server.close());

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/card/tester`, {
        headers: {
            'x-forwarded-host': 'attacker.example',
            'x-forwarded-proto': 'http'
        },
        redirect: 'manual'
    });

    assert.equal(response.status, 302);
    assert.match(response.headers.get('location'), /https:\/\/image\.thum\.io\/.*https:\/\/githubplanet\.dev\/card\.html/);
    assert.doesNotMatch(response.headers.get('location'), /attacker\.example/);
});
