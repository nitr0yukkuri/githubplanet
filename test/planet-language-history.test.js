import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlanetLanguageHistory } from '../front/js/planet-language-history.js';

test('builds chronological language states and adds the current state when it changed', () => {
    const entries = buildPlanetLanguageHistory([
        {
            capturedAt: '2025-02-01T00:00:00.000Z',
            mainLanguage: 'TypeScript',
            planetColor: '#3178c6',
            languagePercentages: { TypeScript: 80, JavaScript: 20 }
        },
        {
            capturedAt: '2025-01-01T00:00:00.000Z',
            mainLanguage: 'JavaScript',
            planetColor: '#f1e05a',
            languagePercentages: { JavaScript: 100 }
        }
    ], {
        mainLanguage: 'Rust',
        planetColor: '#dea584',
        languageStats: { Rust: 90, TypeScript: 10 }
    });

    assert.deepEqual(entries.map(({ mainLanguage }) => mainLanguage), [
        'JavaScript', 'TypeScript', 'Rust'
    ]);
    assert.equal(entries.at(-1).isCurrent, true);
    assert.deepEqual(entries.at(-1).languagePercentages, { Rust: 90, TypeScript: 10 });
});

test('does not show a slider when history contains no composition change', () => {
    const current = {
        mainLanguage: 'TypeScript',
        planetColor: '#3178c6',
        languageStats: { TypeScript: 80, JavaScript: 20 }
    };
    const entries = buildPlanetLanguageHistory([{
        capturedAt: '2025-02-01T00:00:00.000Z',
        mainLanguage: 'TypeScript',
        planetColor: '#3178c6',
        languagePercentages: { JavaScript: 20, TypeScript: 80 }
    }], current);

    assert.deepEqual(entries, []);
});

test('ignores snapshots with invalid dates or colors', () => {
    const entries = buildPlanetLanguageHistory([
        {
            capturedAt: 'not-a-date',
            mainLanguage: 'JavaScript',
            planetColor: '#f1e05a',
            languagePercentages: { JavaScript: 100 }
        },
        {
            capturedAt: '2025-01-01T00:00:00.000Z',
            mainLanguage: 'JavaScript',
            planetColor: 'red',
            languagePercentages: { JavaScript: 100 }
        }
    ], {
        mainLanguage: 'TypeScript',
        planetColor: '#3178c6',
        languageStats: { TypeScript: 100 }
    });

    assert.deepEqual(entries, []);
});
