import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCardLanguageTheme, getCardAccentColor } from '../front/js/card-language-theme.js';

function cardElement() {
    const properties = new Map();
    return {
        properties,
        dataset: {},
        style: {
            setProperty: (key, value) => properties.set(key, value),
            removeProperty: (key) => properties.delete(key)
        },
        removeAttribute(name) {
            assert.equal(name, 'data-card-theme');
            delete this.dataset.cardTheme;
        }
    };
}

test('keeps CSS card colors fixed while other features follow the saved planet color', () => {
    const element = cardElement();
    for (const planetColor of ['#123456', '#fedcba']) {
        const data = { mainLanguage: 'CSS', planetColor };
        applyCardLanguageTheme(element, data);
        assert.equal(element.dataset.cardTheme, 'css-spectrum');
        assert.equal(element.properties.get('--planet-card-atmosphere'), 'rgba(112, 64, 179, 0.24)');
        assert.equal(getCardAccentColor(data), '#d7bcff');
    }
    const data = { mainLanguage: 'TypeScript', planetColor: '#123456' };
    applyCardLanguageTheme(element, data);
    assert.equal(element.dataset.cardTheme, 'typescript-shell');
    assert.equal(element.properties.get('--planet-card-atmosphere'), 'rgba(18, 52, 86, 0.24)');
    assert.equal(getCardAccentColor(data), '#123456');
});

test('resets feature styles when switching to a language without a card theme', () => {
    const element = cardElement();
    applyCardLanguageTheme(element, { mainLanguage: 'CSS', planetColor: '#ffffff' });
    assert.equal(element.properties.size, 6);
    applyCardLanguageTheme(element, { mainLanguage: 'Unknown', planetColor: '#808080' });
    assert.equal(element.properties.size, 0);
    assert.equal(element.dataset.cardTheme, undefined);
    assert.equal(getCardAccentColor({ mainLanguage: 'Unknown', planetColor: '#808080' }), '#808080');
});
