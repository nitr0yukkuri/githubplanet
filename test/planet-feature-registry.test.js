import assert from 'node:assert/strict';
import test from 'node:test';
import {
    planetFeatures,
    resolvePlanetFeature
} from '../front/js/planet-features/registry.js';

test('registers every language feature behind one frontend boundary', () => {
    assert.deepEqual(
        planetFeatures.map((feature) => feature.id),
        [
            'c', 'css', 'cpp', 'go', 'swift', 'vue',
            'typescript', 'javascript', 'java', 'kotlin', 'rust', 'ruby'
        ]
    );

    for (const feature of planetFeatures) {
        assert.equal(typeof feature.matches, 'function', feature.id);
        assert.equal(typeof feature.createMaterial, 'function', feature.id);
        if (feature.update) assert.equal(typeof feature.update, 'function', feature.id);
    }
});

test('resolves exact language features without cross-matching', () => {
    assert.equal(resolvePlanetFeature({ mainLanguage: ' java ' }).id, 'java');
    assert.equal(resolvePlanetFeature({ mainLanguage: 'Kotlin' }).id, 'kotlin');
    assert.equal(resolvePlanetFeature({ mainLanguage: 'C++' }).id, 'cpp');
    assert.equal(resolvePlanetFeature({ mainLanguage: 'JavaScript' }).id, 'javascript');
    assert.equal(resolvePlanetFeature({ mainLanguage: 'Unknown' }), null);
});

test('calculates wind speed only for wind-based planet features', () => {
    assert.deepEqual(
        planetFeatures.filter((feature) => feature.usesWindSpeed).map((feature) => feature.id),
        ['go', 'swift', 'vue']
    );
});
