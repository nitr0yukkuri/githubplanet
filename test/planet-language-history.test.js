import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildPlanetLanguageHistory,
    buildPlanetLanguageYearStops,
    createPlanetLanguageHistory
} from '../front/js/planet-language-history.js';

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

test('keeps contribution history independently of the current planet snapshot', () => {
    const entries = buildPlanetLanguageHistory([
        {
            capturedAt: '2023-03-01T00:00:00.000Z',
            mainLanguage: 'Python',
            planetColor: '#306998',
            languageStats: { Python: 80 }
        },
        {
            capturedAt: '2024-07-01T00:00:00.000Z',
            mainLanguage: 'Python',
            planetColor: '#306998',
            languageStats: { Python: 80, TypeScript: 20 }
        }
    ], null);

    assert.equal(entries.length, 2);
    assert.deepEqual(entries[0].languagePercentages, { Python: 100 });
    assert.deepEqual(entries[1].languagePercentages, { Python: 80, TypeScript: 20 });
    assert.deepEqual(buildPlanetLanguageYearStops(entries), [
        { year: 2023, entryIndex: 0 },
        { year: 2024, entryIndex: 1 }
    ]);
});

test('uses daily history points for slider motion and dispatches the latest state immediately', () => {
    const listeners = {};
    const attributes = {};
    const slider = {
        addEventListener: (name, handler) => { listeners[name] = handler; },
        setAttribute: (name, value) => { attributes[name] = value; },
        value: '0',
        clientWidth: 400
    };
    const dateOutput = { textContent: '' };
    const years = {
        children: [],
        append(marker) { this.children.push(marker); },
        replaceChildren() { this.children = []; }
    };
    const element = {
        hidden: true,
        dataset: {},
        style: { setProperty() {} },
        querySelector: (selector) => ({
            '#planet-language-history-slider': slider,
            '#planet-language-history-date': dateOutput,
            '#planet-language-history-years': years
        })[selector]
    };
    const selected = [];
    globalThis.document = {
        documentElement: { lang: 'en' },
        createElement: () => {
            return { dataset: {}, style: {} };
        }
    };
    const timeline = createPlanetLanguageHistory({ element, onSelect: (entry) => selected.push(entry) });

    timeline.show([
        { capturedAt: '2024-02-01T00:00:00.000Z', mainLanguage: 'Python', planetColor: '#306998', languageStats: { Python: 80 } },
        { capturedAt: '2024-10-01T00:00:00.000Z', mainLanguage: 'Python', planetColor: '#306998', languageStats: { Python: 70, Rust: 30 } },
        { capturedAt: '2025-05-01T00:00:00.000Z', mainLanguage: 'Rust', planetColor: '#306998', languageStats: { Python: 60, Rust: 40 } }
    ], null);

    assert.equal(element.hidden, false);
    assert.equal(slider.max, '2');
    assert.equal(slider.value, '2');
    assert.equal(selected.at(-1).mainLanguage, 'Rust');
    assert.equal(years.children[1].style.left, '100%');
    slider.value = '0';
    listeners.input();
    assert.equal(selected.at(-1).mainLanguage, 'Python');
    assert.match(attributes['aria-valuetext'], /2024/);
    delete globalThis.document;
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

test('creates one chronological stop per year at that year’s latest state', () => {
    const entries = [
        { capturedAt: '2024-02-01T00:00:00.000Z' },
        { capturedAt: '2024-11-01T00:00:00.000Z' },
        { capturedAt: '2025-06-01T00:00:00.000Z' },
        { capturedAt: '2025-07-01T00:00:00.000Z', isCurrent: true }
    ];

    assert.deepEqual(
        buildPlanetLanguageYearStops(entries, Date.parse('2026-10-21T00:00:00.000Z')),
        [
            { year: 2024, entryIndex: 1 },
            { year: 2025, entryIndex: 3 },
            { year: 2026, entryIndex: 3 }
        ]
    );
});
