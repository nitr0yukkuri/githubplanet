import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPlanetFeatureRuntime, resolvePlanetFeature } from '../front/js/planet-features/registry.js';

test('registers Shell clouds through the common planet runtime', () => {
    assert.equal(resolvePlanetFeature({ mainLanguage: ' shell ' })?.id, 'shell');
    assert.equal(resolvePlanetFeature({ mainLanguage: 'Shell script' }), null);
    const texture = new THREE.Texture();
    const runtime = createPlanetFeatureRuntime({
        THREE, planetTexture: texture,
        data: { mainLanguage: 'Shell' }, radius: 1
    });
    assert.equal(runtime.material.map, texture);
    assert.equal(runtime.objects.clouds.children.length, 1);
    runtime.update(16_000);
    assert.equal(runtime.objects.clouds.userData.shellCloudUniforms.shellCloudTime.value, 0.5);
    texture.dispose();
});
