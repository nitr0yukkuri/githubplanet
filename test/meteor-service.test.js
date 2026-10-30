import assert from 'node:assert/strict';
import test from 'node:test';
import { createMeteorService } from '../src/application/meteor-service.js';

function createHarness() {
    const emissions = [];
    const logs = [];
    const service = createMeteorService({
        languageColorService: {
            async resolveLanguageColor(language) { return language === 'JavaScript' ? '#f0db4f' : '#808080'; }
        },
        extensionMap: { js: 'JavaScript', ts: 'TypeScript' },
        emitMeteor: (event) => emissions.push(event),
        logger: { log: (message) => logs.push(message) }
    });
    return { service, emissions, logs };
}

test('emits a manual meteor using the existing color fallback and scale cap', async () => {
    const { service, emissions, logs } = createHarness();

    const result = await service.emitManualMeteor({ language: 'JavaScript', scale: 9 });

    assert.deepEqual(result, { color: '#f0db4f' });
    assert.deepEqual(emissions, [{ color: '#f0db4f', language: 'JavaScript', scale: 1.5 }]);
    assert.match(logs[0], /Scale: 1\.5/);
});

test('maps webhook commit files to the existing language and scale event', async () => {
    const { service, emissions, logs } = createHarness();

    await service.processWebhook({
        repository: { language: 'Ruby' },
        commits: [{
            id: 'abcdef123456',
            total_lines: 1000,
            added: ['src/main.ts'],
            modified: ['README.md']
        }]
    });

    assert.deepEqual(emissions, [{
        color: '#808080', language: 'TypeScript', scale: 1 + (Math.log10(1001) * 0.25)
    }]);
    assert.match(logs[0], /abcdef1/);
});

test('ignores payloads without a repository and commit list', async () => {
    const { service, emissions } = createHarness();

    await service.processWebhook({ repository: { language: 'Ruby' }, commits: null });

    assert.deepEqual(emissions, []);
});
