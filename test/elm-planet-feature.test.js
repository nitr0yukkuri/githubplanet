import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPlanetFeatureRuntime, resolvePlanetFeature } from '../front/js/planet-features/registry.js';

test('registers and renders only normalized Elm planets', () => {
    const feature = resolvePlanetFeature({ mainLanguage: ' elm ' });
    assert.equal(feature?.id, 'elm');
    assert.equal(resolvePlanetFeature({ mainLanguage: 'Elm.js' }), null);

    const texture = new THREE.Texture();
    const runtime = createPlanetFeatureRuntime({
        THREE,
        planetTexture: texture,
        data: { mainLanguage: 'Elm', planetColor: '#3f9b55' },
        radius: 1
    });
    assert.equal(runtime.id, 'elm');
    assert.equal(runtime.material.map, texture);
    runtime.update(12_000);
    assert.equal(runtime.material.userData.elmVegetationUniforms.elmVegetationTime.value, 0.5);
    runtime.material.dispose();
    texture.dispose();
});
