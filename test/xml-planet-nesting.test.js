import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createXmlPlanetMaterial,
    isXmlPlanet,
    updateXmlPlanetNesting
} from '../front/js/xml-planet-nesting.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
        this.userData = {};
    }
}

const THREE = { MeshStandardMaterial: FakeMaterial };

test('matches only normalized XML planets', () => {
    assert.equal(isXmlPlanet({ mainLanguage: 'XML' }), true);
    assert.equal(isXmlPlanet({ mainLanguage: ' xml ' }), true);
    assert.equal(isXmlPlanet({ mainLanguage: 'HTML' }), false);
    assert.equal(isXmlPlanet({ mainLanguage: 'LLVM' }), false);
});

test('keeps the terrain texture beneath nested surface structures', () => {
    const texture = { id: 'mars-terrain' };
    const material = createXmlPlanetMaterial(THREE, texture);

    assert.equal(material.color, 0xffffff);
    assert.equal(material.map, texture);
    assert.equal(material.aoMap, texture);
    assert.equal(material.customProgramCacheKey(), 'xml-planet-nested-surface-v4-readable-response');

    const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader: '#include <common>\n#include <map_fragment>'
    };
    material.onBeforeCompile(shader);

    assert.equal(
        shader.uniforms.xmlNestingTime,
        material.userData.xmlNestingUniforms.xmlNestingTime
    );
    assert.match(shader.fragmentShader, /xmlNested/);
    assert.match(shader.fragmentShader, /xmlBranch/);
    assert.match(shader.fragmentShader, /xmlBranchResponse/);
    assert.match(shader.fragmentShader, /xmlMappedTexture/);
});

test('updates on a seamless eighteen-second cycle', () => {
    const material = createXmlPlanetMaterial(THREE, {});

    updateXmlPlanetNesting(material, 4500);
    assert.equal(material.userData.xmlNestingUniforms.xmlNestingTime.value, 0.25);
    updateXmlPlanetNesting(material, 22500);
    assert.equal(material.userData.xmlNestingUniforms.xmlNestingTime.value, 0.25);
});

