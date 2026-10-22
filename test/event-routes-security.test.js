import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import express from 'express';
import { createMeteorService } from '../src/application/meteor-service.js';
import { registerEventRoutes } from '../src/presentation/http/event-routes.js';

test('protects internal event tools and verifies GitHub webhook signatures', async (t) => {
    const app = express();
    app.use(express.json({
        verify: (req, res, buffer) => {
            req.rawBody = Buffer.from(buffer);
        }
    }));
    app.use((req, res, next) => {
        if (req.get('x-test-session') === 'logged-in') {
            req.session = { planetData: { user: { login: 'tester' } } };
        }
        next();
    });

    const geminiClient = {
        ask: async () => 'ok',
        resolveLanguageColor: async () => '#f0db4f'
    };
    let processedWebhookDeliveries = 0;
    const meteorService = createMeteorService({
        geminiClient,
        extensionMap: { js: 'JavaScript' },
        emitMeteor: () => {}
    });
    const processWebhook = meteorService.processWebhook;
    meteorService.processWebhook = async (...args) => {
        processedWebhookDeliveries += 1;
        return processWebhook(...args);
    };
    registerEventRoutes(app, {
        geminiClient,
        meteorService,
        webhookDeliveryStore: {
            deliveries: new Set(),
            payloads: new Set(),
            async claimGithubWebhookDelivery(deliveryId, payloadHash) {
                if (this.deliveries.has(deliveryId) || this.payloads.has(payloadHash)) return false;
                this.deliveries.add(deliveryId);
                this.payloads.add(payloadHash);
                return true;
            }
        },
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
    const loggedInDebug = await fetch(`${baseUrl}/api/debug-color/JavaScript`, {
        headers: { 'x-test-session': 'logged-in' }
    });
    const queryKeyDebug = await fetch(`${baseUrl}/api/debug-color/JavaScript?api_key=system-secret`);
    assert.equal(unauthorizedMeteor.status, 401);
    assert.equal(unauthorizedDebug.status, 401);
    assert.equal(loggedInDebug.status, 401);
    assert.equal(queryKeyDebug.status, 401);

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
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signature,
        'x-github-delivery': '123e4567-e89b-12d3-a456-426614174000'
      },
        body
    });
    assert.equal(signedWebhook.status, 200);
    assert.equal(await signedWebhook.text(), 'OK');

    const replayedWebhook = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-hub-signature-256': signature,
            'x-github-delivery': '123e4567-e89b-12d3-a456-426614174001'
        },
        body
    });
    assert.equal(replayedWebhook.status, 200);
    assert.equal(await replayedWebhook.text(), 'OK');
    assert.equal(processedWebhookDeliveries, 1);
});
