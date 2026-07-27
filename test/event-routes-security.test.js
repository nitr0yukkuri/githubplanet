import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import express from 'express';
import { registerEventRoutes } from '../src/presentation/http/event-routes.js';

test('protects internal event tools and verifies GitHub webhook signatures', async (t) => {
    const app = express();
    app.use(express.json({
        verify: (req, res, buffer) => {
            req.rawBody = Buffer.from(buffer);
        }
    }));

    registerEventRoutes(app, {
        geminiClient: {
            ask: async () => 'ok',
            resolveLanguageColor: async () => '#f0db4f'
        },
        extensionMap: { js: 'JavaScript' },
        emitMeteor: () => {},
        systemApiKey: 'system-secret',
        webhookSecret: 'webhook-secret',
        requireInternalAuth: true,
        requireWebhookSignature: true
    });

    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => server.close());
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    const unauthorizedMeteor = await fetch(`${baseUrl}/api/meteor`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ language: 'JavaScript' })
    });
    const unauthorizedDebug = await fetch(`${baseUrl}/api/debug-color/JavaScript`);
    assert.equal(unauthorizedMeteor.status, 401);
    assert.equal(unauthorizedDebug.status, 401);

    const authorizedMeteor = await fetch(`${baseUrl}/api/meteor`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': 'system-secret' },
        body: JSON.stringify({ language: 'JavaScript' })
    });
    assert.equal(authorizedMeteor.status, 200);

    const body = JSON.stringify({ repository: { language: 'JavaScript' }, commits: [] });
    const unsignedWebhook = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body
    });
    assert.equal(unsignedWebhook.status, 401);

    const signature = `sha256=${crypto.createHmac('sha256', 'webhook-secret').update(body).digest('hex')}`;
    const signedWebhook = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
        body
    });
    assert.equal(signedWebhook.status, 200);
    assert.equal(await signedWebhook.text(), 'OK');
});
