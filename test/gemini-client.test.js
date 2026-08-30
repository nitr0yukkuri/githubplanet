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
    const client = createGeminiClient({ axios, apiKey: 'key', languageColors: {} });

    assert.equal(await client.resolveLanguageColor('NewLanguage'), '#ff00aa');
    assert.deepEqual(requests.map(({ config }) => config.timeout), [5_000, 5_000]);
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
        languageColors: {},
        modelListCacheTtlMs: 60_000
    });

    assert.equal(await client.ask('first'), 'ok');
    assert.equal(await client.ask('second'), 'ok');
    assert.equal(listModelsCalls, 1);
    assert.equal(generationCalls, 2);
});

test('reuses a persisted language color without calling Gemini', async () => {
    let findCalls = 0;
    let generateCalls = 0;
    const axios = {
        async get() {
            throw new Error('Gemini should not be called');
        },
        async post() {
            generateCalls += 1;
            throw new Error('Gemini should not be called');
        }
    };
    const repository = {
        async findLanguageColor(language) {
            findCalls += 1;
            assert.equal(language, 'NewLanguage');
            return '#123456';
        },
        async saveLanguageColor() {
            throw new Error('A persisted color should not be written again');
        }
    };
    const client = createGeminiClient({
        axios,
        apiKey: 'key',
        languageColors: {},
        repository
    });

    assert.equal(await client.resolveLanguageColor('NewLanguage'), '#123456');
    assert.equal(await client.resolveLanguageColor('NewLanguage'), '#123456');
    assert.equal(findCalls, 1);
    assert.equal(generateCalls, 0);
});

test('uses the startup-loaded language color cache before the repository', async () => {
    let findCalls = 0;
    const axios = {
        async get() {
            throw new Error('Gemini should not be called');
        },
        async post() {
            throw new Error('Gemini should not be called');
        }
    };
    const client = createGeminiClient({
        axios,
        apiKey: 'key',
        languageColors: {},
        languageColorCache: { NewLanguage: '#654321' },
        repository: {
            async findLanguageColor() {
                findCalls += 1;
                return null;
            }
        }
    });

    assert.equal(await client.resolveLanguageColor('NewLanguage'), '#654321');
    assert.equal(findCalls, 0);
});

test('persists one generated language color and shares concurrent first requests', async () => {
    let findCalls = 0;
    let saveCalls = 0;
    let generateCalls = 0;
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
            generateCalls += 1;
            await new Promise((resolve) => setTimeout(resolve, 5));
            return { data: { candidates: [{ content: { parts: [{ text: '#abcdef' }] } }] } };
        }
    };
    const repository = {
        async findLanguageColor() {
            findCalls += 1;
            return null;
        },
        async saveLanguageColor(language, color) {
            saveCalls += 1;
            assert.equal(language, 'NewLanguage');
            assert.equal(color, '#abcdef');
            return color;
        }
    };
    const client = createGeminiClient({
        axios,
        apiKey: 'key',
        languageColors: {},
        repository
    });

    const colors = await Promise.all([
        client.resolveLanguageColor('NewLanguage'),
        client.resolveLanguageColor('NewLanguage')
    ]);
    assert.deepEqual(colors, ['#abcdef', '#abcdef']);
    assert.equal(findCalls, 1);
    assert.equal(saveCalls, 1);
    assert.equal(generateCalls, 1);
});

test('keeps generating a color when the persisted cache is temporarily unavailable', async () => {
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
            return { data: { candidates: [{ content: { parts: [{ text: '#fedcba' }] } }] } };
        }
    };
    const repository = {
        async findLanguageColor() {
            throw new Error('cache database unavailable');
        },
        async saveLanguageColor() {
            throw new Error('cache database unavailable');
        }
    };
    const client = createGeminiClient({
        axios,
        apiKey: 'key',
        languageColors: {},
        repository
    });

    assert.equal(await client.resolveLanguageColor('NewLanguage'), '#fedcba');
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
        languageColors: {},
        onRequestTiming: (event) => timings.push(event)
    });

    assert.equal(await client.resolveLanguageColor('NewLanguage'), '#ff00aa');
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
    const client = createGeminiClient({ axios, apiKey: 'key', languageColors: {} });

    assert.equal(await client.ask('name this planet'), null);
    assert.equal(await client.resolveLanguageColor('NewLanguage'), '#808080');
});
