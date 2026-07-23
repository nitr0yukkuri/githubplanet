import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createJavaScriptPlanetMaterial,
    isJavaScriptPlanet,
    updateJavaScriptPlanetReactivity
} from '../front/js/javascript-planet-reactivity.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
        this.userData = {};
    }
}

const THREE = { MeshStandardMaterial: FakeMaterial };

test('matches only normalized JavaScript planets', () => {
    assert.equal(isJavaScriptPlanet({ mainLanguage: 'JavaScript' }), true);
    assert.equal(isJavaScriptPlanet({ mainLanguage: ' javascript ' }), true);
    assert.equal(isJavaScriptPlanet({ mainLanguage: 'TypeScript' }), false);
    assert.equal(isJavaScriptPlanet({ mainLanguage: 'JavaScript React' }), false);
});

test('preserves the supplied language color and textured terrain', () => {
    const texture = { id: 'mars-terrain' };
    const material = createJavaScriptPlanetMaterial(THREE, texture, '#f0db4f');

    assert.equal(material.color, '#f0db4f');
    assert.equal(material.aoMap, texture);
    assert.equal(material.aoMapIntensity, 1.5);
    assert.equal(material.roughness, 0.8);
    assert.equal(material.metalness, 0.2);
    assert.equal(material.customProgramCacheKey(), 'javascript-planet-flexible-reactivity-v2');

    const shader = {
        uniforms: {},
        vertexShader: 'void main() {\n#include <begin_vertex>\n}',
        fragmentShader: 'void main() {\n#include <map_fragment>\n}'
    };
    material.onBeforeCompile(shader);

    assert.match(shader.fragmentShader, /jsFlex/);
    assert.match(shader.fragmentShader, /jsUncertainty/);
    assert.match(shader.fragmentShader, /jsRegionA/);
    assert.match(shader.fragmentShader, /jsReaction \* 0\.42/);
    assert.doesNotMatch(shader.fragmentShader, /vec3\(0\.9, 0\.82, 0\.7\)/);
});

test('updates on a seamless twelve-second cycle', () => {
    const material = createJavaScriptPlanetMaterial(THREE, {}, '#f0db4f');

    updateJavaScriptPlanetReactivity(material, 3000);
    assert.equal(material.userData.jsReactionUniforms.jsReactionTime.value, 0.25);
    updateJavaScriptPlanetReactivity(material, 15000);
    assert.equal(material.userData.jsReactionUniforms.jsReactionTime.value, 0.25);
});
