import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createHtmlPlanetMaterial,
    isHtmlPlanet,
    updateHtmlPlanetLayers
} from '../front/js/html-planet-semantic-layers.js';

function createThreeStub() {
    return {
        Color: class Color {
            constructor(value) { this.value = value; }
        },
        MeshStandardMaterial: class MeshStandardMaterial {
            constructor(options) {
                Object.assign(this, options);
                this.userData = {};
            }
        }
    };
}

test('matches only normalized HTML planets', () => {
    assert.equal(isHtmlPlanet({ mainLanguage: 'HTML' }), true);
    assert.equal(isHtmlPlanet({ mainLanguage: ' html ' }), true);
    assert.equal(isHtmlPlanet({ mainLanguage: 'Java' }), false);
    assert.equal(isHtmlPlanet({ mainLanguage: 'JavaScript' }), false);
});

test('preserves terrain while engraving a sparse DOM network into the surface', () => {
    const THREE = createThreeStub();
    const texture = {};
    const material = createHtmlPlanetMaterial(THREE, texture, '#e34c26');

    assert.equal(material.color, '#e34c26');
    assert.equal(material.aoMap, texture);
    assert.equal(material.aoMapIntensity, 1.5);
    assert.equal(material.roughness, 0.8);
    assert.equal(material.metalness, 0.2);
    assert.equal(material.customProgramCacheKey(), 'html-planet-engraved-dom-network-v8');

    const shader = {
        uniforms: {},
        vertexShader: 'void main() {\n#include <begin_vertex>\n}',
        fragmentShader: 'void main() {\n#include <map_fragment>\n}'
    };
    material.onBeforeCompile(shader);

    assert.match(shader.fragmentShader, /htmlSegmentPath/);
    assert.match(shader.fragmentShader, /htmlBranchGroove/);
    assert.match(shader.fragmentShader, /htmlNodeShape/);
    assert.match(shader.fragmentShader, /htmlGroove/);
    assert.match(shader.fragmentShader, /htmlAmberEdge/);
    assert.match(shader.fragmentShader, /htmlTerrain/);
    assert.match(shader.fragmentShader, /htmlPath < 18/);
    assert.doesNotMatch(shader.vertexShader, /transformed \+=/);
});

test('updates on a seamless eighteen-second cycle', () => {
    const material = createHtmlPlanetMaterial(createThreeStub(), {}, '#e34c26');

    updateHtmlPlanetLayers(material, 4500);
    assert.equal(material.userData.htmlLayerUniforms.htmlLayerTime.value, 0.25);
    updateHtmlPlanetLayers(material, 22500);
    assert.equal(material.userData.htmlLayerUniforms.htmlLayerTime.value, 0.25);
});
