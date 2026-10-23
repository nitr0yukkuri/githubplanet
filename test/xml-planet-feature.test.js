import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPlanetFeatureRuntime, resolvePlanetFeature } from '../front/js/planet-features/registry.js';

test('registers XML nesting through the common planet runtime', () => {
    assert.equal(resolvePlanetFeature({ mainLanguage: ' XML ' })?.id, 'xml');
    assert.equal(resolvePlanetFeature({ mainLanguage: 'XML-like' }), null);
    const texture = new THREE.Texture();
    const runtime = createPlanetFeatureRuntime({
        THREE, planetTexture: texture,
        data: { mainLanguage: 'XML' }, radius: 1
    });
    assert.equal(runtime.material.map, texture);
    runtime.update(4_500);
    assert.equal(runtime.material.userData.xmlNestingUniforms.xmlNestingTime.value, 0.25);
    texture.dispose();
});
