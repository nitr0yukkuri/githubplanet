import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createGoPlanetWindMaterial,
    isGoPlanet,
    updateGoPlanetWind
} from '../front/js/go-planet-wind.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
        this.userData = {};
    }
}

const THREE = { MeshStandardMaterial: FakeMaterial };

test('matches only normalized Go planets', () => {
    assert.equal(isGoPlanet({ mainLanguage: 'Go' }), true);
    assert.equal(isGoPlanet({ mainLanguage: ' go ' }), true);
    assert.equal(isGoPlanet({ mainLanguage: 'Go Template' }), false);
    assert.equal(isGoPlanet({ mainLanguage: 'C++' }), false);
});

test('injects one-way oblique wind streaks while preserving terrain', () => {
    const texture = { id: 'terrain' };
    const material = createGoPlanetWindMaterial(THREE, texture);
    const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader: '#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>'
    };

    material.onBeforeCompile(shader);

    assert.equal(material.map, texture);
    assert.equal(material.aoMap, texture);
    assert.match(shader.vertexShader, /vGoWindPosition = position/);
    assert.match(shader.vertexShader, /vGoWindViewNormal = normalize\(normalMatrix \* normal\)/);
    assert.match(shader.fragmentShader, /goWindAxis/);
    assert.match(shader.fragmentShader, /goTravel/);
    assert.match(shader.fragmentShader, /goPrimaryStreak/);
    assert.match(shader.fragmentShader, /goTailGate/);
    assert.match(shader.fragmentShader, /goRimGust/);
    assert.match(shader.fragmentShader, /goMappedTexture/);
    assert.equal(shader.uniforms.goWindTime, material.userData.goWindUniforms.goWindTime);
});

test('updates wind time in seconds', () => {
    const material = createGoPlanetWindMaterial(THREE, {}, '#00ADD8');
    updateGoPlanetWind(material, 1000);
    assert.equal(material.userData.goWindUniforms.goWindTime.value, 0);
    updateGoPlanetWind(material, 2250);
    assert.equal(material.userData.goWindUniforms.goWindTime.value, 1.25);
});
