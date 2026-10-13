import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
    createPerlPlanetOceanMaterial,
    isPerlPlanet,
    updatePerlPlanetOcean
} from '../front/js/perl-planet-ocean.js';
import { createPlanetFeatureRuntime } from '../front/js/planet-features/registry.js';

test('matches only normalized Perl planets', () => {
    assert.equal(isPerlPlanet({ mainLanguage: ' Perl ' }), true);
    assert.equal(isPerlPlanet({ mainLanguage: 'PERL' }), true);
    assert.equal(isPerlPlanet({ mainLanguage: 'PerlScript' }), false);
    assert.equal(isPerlPlanet({ mainLanguage: 'Perl 6' }), false);
});

test('keeps the Mars map contract and shades the ocean with subdued physical reflections', () => {
    const texture = new THREE.Texture();
    const material = createPerlPlanetOceanMaterial(THREE, texture);
    const shader = {
        uniforms: {},
        vertexShader: THREE.ShaderLib.physical.vertexShader,
        fragmentShader: THREE.ShaderLib.physical.fragmentShader
    };

    material.onBeforeCompile(shader);

    assert.equal(material.map, texture);
    assert.equal(material.aoMap, texture);
    assert.equal(material.aoMapIntensity, 0);
    assert.equal(material.isMeshPhysicalMaterial, true);
    assert.equal(material.roughness, 0.62);
    assert.equal(material.metalness, 0);
    assert.equal(material.ior, 1.333);
    assert.equal(material.clearcoat, 0.2);
    assert.equal(material.clearcoatRoughness, 0.18);
    assert.equal(material.customProgramCacheKey(), 'perl-planet-ocean-v4-water-specular');
    assert.ok(shader.uniforms.perlOceanTime);
    assert.match(shader.vertexShader, /vPerlOceanDirection = normalize\(position\)/);
    assert.match(shader.fragmentShader, /perlMarsTexture = diffuseColor\.rgb/);
    assert.match(shader.fragmentShader, /perlSeaColor = mix\(perlSeaColor, perlSubmergedMars, 0\.12\)/);
    assert.match(shader.fragmentShader, /perlDeepSea = vec3\(0\.006, 0\.045, 0\.10\)/);
    assert.match(shader.fragmentShader, /perlOpenSea = vec3\(0\.018, 0\.20, 0\.34\)/);
    assert.match(shader.fragmentShader, /0\.31 \+ 0\.24 \* perlCurrent/);
    assert.match(shader.fragmentShader, /perlSeaColor \*= 0\.92 \+ perlMarsRelief \* 0\.16/);
    assert.match(shader.fragmentShader, /perlWaveSlope = cos\(perlCurrentPhase\) \* 0\.006 \* 3\.6/);
    assert.match(shader.fragmentShader, /normal = normalize\(normal - vPerlOceanWaveTangentView \* perlWaveSlope\)/);
    assert.match(shader.vertexShader, /vPerlOceanWaveTangentView = normalMatrix \* perlWaveTangent/);
    assert.match(shader.fragmentShader, /clearcoatNormal = normalize\(clearcoatNormal - vPerlOceanWaveTangentView \* perlWaveSlope\)/);
    assert.doesNotMatch(shader.fragmentShader, /normalMatrix/);
    assert.doesNotMatch(shader.fragmentShader, /perlWaterFresnel|totalEmissiveRadiance \+= vec3\(0\.012/);
    assert.doesNotMatch(shader.fragmentShader, /foam|caustic|perlNoise/i);

    material.dispose();
    texture.dispose();
});

test('registers the ocean runtime on the shared planet feature path', () => {
    const texture = new THREE.Texture();
    const runtime = createPlanetFeatureRuntime({
        THREE,
        planetTexture: texture,
        data: { mainLanguage: 'Perl' },
        radius: 4
    });

    assert.equal(runtime.id, 'perl');
    assert.equal(runtime.sceneObjects.length, 0);
    runtime.update(10_000);
    assert.equal(runtime.material.userData.perlOceanUniforms.perlOceanTime.value, 0);
    runtime.update(28_000);
    assert.equal(runtime.material.userData.perlOceanUniforms.perlOceanTime.value, 0.5);
    runtime.update(46_000);
    assert.equal(runtime.material.userData.perlOceanUniforms.perlOceanTime.value, 0);

    runtime.dispose();
    texture.dispose();
});
