import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = { location: { pathname: '/en' } };

const { localizedPlanetName, localizedTitle, localizedTitlePart } = await import('../front/js/i18n.js');

test('localizes legacy Japanese title parts on English routes', () => {
    const legacyTitles = [
        [{ prefix: '努力の', suffix: '職人' }, 'Diligent Artisan'],
        [{ prefix: '熟練の', suffix: '達人' }, 'Seasoned Master'],
        [{ prefix: '伝説の', suffix: '英雄' }, 'Legendary Hero']
    ];

    for (const [title, expected] of legacyTitles) {
        assert.equal(localizedTitle(title), expected);
    }
});

test('keeps unknown English title parts unchanged', () => {
    assert.equal(localizedTitlePart('Bit', 'prefix'), 'Bit');
    assert.equal(localizedTitlePart('Byte', 'suffix'), 'Byte');
    assert.equal(localizedTitle({ prefix: 'Bit', suffix: 'Byte' }), 'Bit Byte');
});

test('localizes the hyphenated Objective-C language key', () => {
    assert.equal(localizedPlanetName({
        mainLanguage: 'Objective-C',
        planetColor: '#438eff',
        totalCommits: 100
    }), 'Objective Blue-Sky Star');
});

test('keeps title parts in Japanese on Japanese routes', () => {
    window.location.pathname = '/';

    assert.equal(localizedTitle({ prefix: '努力の', suffix: '職人' }), '努力の 職人');

    window.location.pathname = '/en';
});
