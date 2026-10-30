import assert from 'node:assert/strict';
import test from 'node:test';
import { createLanguageColorService } from '../src/application/language-color-service.js';

test('uses canonical colors and the unknown fallback without I/O', async () => {
    const service = createLanguageColorService({ ask: () => { throw new Error('unexpected generation'); } });
    assert.equal(await service.resolveLanguageColor('TypeScript'), '#007acc');
    assert.equal(await service.resolveLanguageColor('Unknown'), '#808080');
    assert.equal(await service.resolveLanguageColor(''), '#808080');
});

test('uses a startup color before consulting storage or generation', async () => {
    const service = createLanguageColorService({
        ask: () => { throw new Error('unexpected generation'); },
        languageColorCache: { NewLanguage: '#654321' },
        languageColorStore: { findLanguageColor: () => { throw new Error('unexpected lookup'); } }
    });
    assert.equal(await service.resolveLanguageColor('NewLanguage'), '#654321');
});

test('memoizes a persisted color without overwriting it', async () => {
    let reads = 0;
    const service = createLanguageColorService({
        ask: () => { throw new Error('unexpected generation'); },
        languageColorStore: {
            async findLanguageColor() { reads++; return '#123456'; },
            saveLanguageColor() { throw new Error('unexpected write'); }
        }
    });
    assert.equal(await service.resolveLanguageColor('NewLanguage'), '#123456');
    assert.equal(await service.resolveLanguageColor('NewLanguage'), '#123456');
    assert.equal(reads, 1);
});

test('shares first requests and returns the color accepted by storage', async () => {
    const calls = [];
    const service = createLanguageColorService({
        async ask(prompt) { calls.push(['ask', prompt]); return 'Color: #abcdef'; },
        languageColorStore: {
            async findLanguageColor(language) { calls.push(['find', language]); return null; },
            async saveLanguageColor(language, color) { calls.push(['save', language, color]); return '#fedcba'; }
        }
    });
    assert.deepEqual(await Promise.all([
        service.resolveLanguageColor('NewLanguage'), service.resolveLanguageColor('NewLanguage')
    ]), ['#fedcba', '#fedcba']);
    assert.deepEqual(calls.map(([operation]) => operation), ['find', 'ask', 'save']);
    assert.deepEqual(calls[2], ['save', 'NewLanguage', '#abcdef']);
    assert.equal(await service.resolveLanguageColor('NewLanguage'), '#fedcba');
    assert.equal(calls.length, 3);
});

test('keeps the generated color when persistent storage is unavailable', async () => {
    const service = createLanguageColorService({
        ask: async () => '#abcdef',
        languageColorStore: {
            async findLanguageColor() { throw new Error('database unavailable'); },
            async saveLanguageColor() { throw new Error('database unavailable'); }
        }
    });
    assert.equal(await service.resolveLanguageColor('NewLanguage'), '#abcdef');
});

test('rejects invalid cached/generated colors and retries after failed generation', async () => {
    let attempts = 0;
    const service = createLanguageColorService({
        languageColorCache: { NewLanguage: 'invalid' },
        languageColorStore: { findLanguageColor: async () => 'invalid' },
        async ask() { return ++attempts === 1 ? 'invalid' : '#123abc'; }
    });
    assert.equal(await service.resolveLanguageColor('NewLanguage'), '#808080');
    assert.equal(await service.resolveLanguageColor('NewLanguage'), '#123abc');
    assert.equal(attempts, 2);
});
