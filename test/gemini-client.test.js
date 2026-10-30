import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeminiClient } from '../src/infrastructure/external/gemini-client.js';

test('bounds Gemini model discovery and generation requests', async () => {
    const requests = [];
    const axios = {
        async get(url, config) {
            requests.push({ method: 'get', url, config });
            return {
                data: {
                    models: [{
                        name: 'models/gemini-2.0-flash',
                        supportedGenerationMethods: ['generateContent']
                    }]
                }
            };
        },
        async post(url, body, config) {
            requests.push({ method: 'post', url, body, config });
            return {
                data: {
                    candidates: [{ content: { parts: [{ text: '#ff00aa' }] } }]
                }
            };
        }
    };
    const client = createGeminiClient({ axios, apiKey: 'key' });

    assert.equal(await client.ask('color'), '#ff00aa');
    assert.deepEqual(requests.map(({ config }) => config.timeout), [5_000, 5_000]);
    assert.ok(requests.every(({ url }) => !url.includes('key=')));
    assert.ok(requests.every(({ config }) => config.headers['x-goog-api-key'] === 'key'));
});

test('reuses the discovered generation model list during its cache window', async () => {
    let listModelsCalls = 0;
    let generationCalls = 0;
    const axios = {
        async get() {
            listModelsCalls += 1;
            return {
                data: {
                    models: [{
                        name: 'models/gemini-2.0-flash',
                        supportedGenerationMethods: ['generateContent']
                    }]
                }
            };
        },
        async post() {
            generationCalls += 1;
            return { data: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } };
        }
    };
    const client = createGeminiClient({
        axios,
        apiKey: 'key',
        modelListCacheTtlMs: 60_000
    });

    assert.equal(await client.ask('first'), 'ok');
    assert.equal(await client.ask('second'), 'ok');
    assert.equal(listModelsCalls, 1);
    assert.equal(generationCalls, 2);
});

test('reports Gemini request timings without changing generated colors', async () => {
    const timings = [];
    const axios = {
        async get() {
            return {
                data: {
                    models: [{
                        name: 'models/gemini-2.0-flash',
                        supportedGenerationMethods: ['generateContent']
                    }]
                }
            };
        },
        async post() {
            return { data: { candidates: [{ content: { parts: [{ text: '#ff00aa' }] } }] } };
        }
    };
    const client = createGeminiClient({
        axios,
        apiKey: 'key',
        onRequestTiming: (event) => timings.push(event)
    });

    assert.equal(await client.ask('color'), '#ff00aa');
    assert.deepEqual(timings.map(({ operation }) => operation), ['list_models', 'generate_content']);
    assert.ok(timings.every(({ provider, outcome, durationMs }) => (
        provider === 'gemini' && outcome === 'success' && durationMs >= 0
    )));
});

test('returns safe fallbacks when Gemini times out', async () => {
    const axios = {
        async get() {
            throw new Error('timeout');
        },
        async post() {
            throw new Error('timeout');
        }
    };
    const client = createGeminiClient({ axios, apiKey: 'key' });

    assert.equal(await client.ask('name this planet'), null);
    assert.equal(await client.ask('color'), null);
});
