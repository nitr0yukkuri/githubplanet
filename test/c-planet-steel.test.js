import assert from 'node:assert/strict';
import test from 'node:test';
import { createCPlanetSteelMaterial, isCPlanet } from '../front/js/c-planet-steel.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
        this.userData = {};
    }
}

class FakeColor {
    constructor(value) {
        this.value = value;
    }
}

const THREE = { MeshStandardMaterial: FakeMaterial, Color: FakeColor };

test('matches C without leaking into C++ or C#', () => {
    assert.equal(isCPlanet({ mainLanguage: 'C' }), true);
    assert.equal(isCPlanet({ mainLanguage: ' c ' }), true);
    assert.equal(isCPlanet({ mainLanguage: 'C++' }), false);
    assert.equal(isCPlanet({ mainLanguage: 'C#' }), false);
});

test('lifts C terrain into charcoal steel with a restrained silver rim', () => {
    const texture = { id: 'mars-terrain' };
    const material = createCPlanetSteelMaterial(THREE, texture);

    assert.equal(material.color, '#74787c');
    assert.equal(material.aoMap, texture);
    assert.equal(material.aoMapIntensity, 0.72);
    assert.equal(material.roughness, 0.7);
    assert.equal(material.metalness, 0.34);
    assert.equal(material.emissive.value, '#171a1d');
    assert.equal(material.emissiveIntensity, 0.28);
    assert.equal(material.customProgramCacheKey(), 'c-planet-charcoal-steel-v1');

    const shader = { fragmentShader: '#include <dithering_fragment>' };
    material.onBeforeCompile(shader);
    assert.match(shader.fragmentShader, /cSteelRim/);
    assert.match(shader.fragmentShader, /vec3\(0\.42, 0\.46, 0\.5\)/);
});
