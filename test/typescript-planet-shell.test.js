import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createTypeScriptPlanetMaterial,
    createTypeScriptPlanetShell,
    isTypeScriptPlanet,
    updateTypeScriptPlanetShell
} from '../front/js/typescript-planet-shell.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
        this.userData = {};
    }
}

class FakeGeometry {
    constructor(...args) {
        this.args = args;
    }
}

class FakeMesh {
    constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
        this.userData = {};
    }
}

class FakeGroup {
    constructor() {
        this.children = [];
        this.userData = {};
    }

    add(child) {
        this.children.push(child);
    }
}

class FakeColor {
    constructor(value) {
        this.value = value;
    }
}

const THREE = {
    MeshStandardMaterial: FakeMaterial,
    ShaderMaterial: FakeMaterial,
    SphereGeometry: FakeGeometry,
    Mesh: FakeMesh,
    Group: FakeGroup,
    Color: FakeColor,
    AdditiveBlending: 'additive',
    FrontSide: 'front',
    BackSide: 'back'
};

test('matches only normalized TypeScript planets', () => {
    assert.equal(isTypeScriptPlanet({ mainLanguage: 'TypeScript' }), true);
    assert.equal(isTypeScriptPlanet({ mainLanguage: ' typescript ' }), true);
    assert.equal(isTypeScriptPlanet({ mainLanguage: 'JavaScript' }), false);
    assert.equal(isTypeScriptPlanet({ mainLanguage: 'TypeScript React' }), false);
});

test('maps the rocky terrain into structured TypeScript-blue relief', () => {
    const texture = { id: 'mars-terrain' };
    const material = createTypeScriptPlanetMaterial(THREE, texture);

    assert.equal(material.color, '#007acc');
    assert.equal(material.map, texture);
    assert.equal(material.aoMap, texture);
    assert.equal(material.aoMapIntensity, 1.5);
    assert.equal(material.roughness, 0.8);
    assert.equal(material.metalness, 0.2);
    assert.equal(typeof material.onBeforeCompile, 'function');
    assert.equal(
        material.customProgramCacheKey(),
        'typescript-planet-textured-surface-v5-mapped'
    );

    const shader = {
        uniforms: {},
        vertexShader: 'void main() {\n#include <begin_vertex>\n}',
        fragmentShader: 'void main() {\n#include <map_fragment>\n}'
    };
    material.onBeforeCompile(shader);

    assert.equal(
        shader.uniforms.tsNarrowingTime,
        material.userData.tsNarrowingUniforms.tsNarrowingTime
    );
    assert.match(shader.fragmentShader, /tsMappedTexture/);
    assert.match(shader.fragmentShader, /tsStructuredRelief/);
    assert.match(shader.fragmentShader, /tsTerrainColor/);
    assert.match(shader.fragmentShader, /texture2D\(map, vMapUv\)/);
    assert.doesNotMatch(shader.vertexShader, /vTsNarrowingPosition/);
    assert.doesNotMatch(shader.fragmentShader, /tsCandidate/);
    assert.doesNotMatch(shader.fragmentShader, /tsUncertainty/);
    assert.doesNotMatch(shader.fragmentShader, /tsNarrowingColor/);
});

test('builds one front guard and three back-facing defensive layers', () => {
    const shell = createTypeScriptPlanetShell(THREE, 4);

    assert.equal(shell.children.length, 4);
    assert.deepEqual(shell.children[0].geometry.args, [4.14, 48, 48]);
    assert.deepEqual(shell.children[1].geometry.args, [4.32, 48, 48]);
    assert.deepEqual(shell.children[2].geometry.args, [4.5, 48, 48]);
    assert.deepEqual(shell.children[3].geometry.args, [4.66, 48, 48]);
    assert.equal(shell.children[0].material.side, 'front');
    assert.equal(shell.children[0].material.uniforms.tsShellFrontLayer.value, 1);
    assert.match(shell.children[0].material.fragmentShader, /frontLayerStrength/);
    assert.equal(shell.children[1].material.uniforms.tsShellFrontLayer.value, 0);
    shell.children.forEach((layer) => {
        assert.equal(layer.material.transparent, true);
        assert.equal(layer.material.depthWrite, false);
        assert.match(layer.material.fragmentShader, /broadGuard/);
        assert.match(layer.material.fragmentShader, /brokenBoundary/);
        assert.match(layer.material.fragmentShader, /validationFilament/);
        assert.match(layer.material.fragmentShader, /guardedNode/);
        assert.match(layer.material.fragmentShader, /continuousGuard/);
        assert.doesNotMatch(layer.material.fragmentShader, /rustDust|sandDust/);
        assert.doesNotMatch(layer.material.fragmentShader, /scan/);
    });
});

test('changes only validation brightness on a seamless twenty-four-second cycle', () => {
    const material = createTypeScriptPlanetMaterial(THREE, {});
    const shell = createTypeScriptPlanetShell(THREE, 1);

    updateTypeScriptPlanetShell(material, 6000);
    assert.equal(material.userData.tsNarrowingUniforms.tsNarrowingTime.value, 0.25);
    updateTypeScriptPlanetShell(material, 30000);
    assert.equal(material.userData.tsNarrowingUniforms.tsNarrowingTime.value, 0.25);

    updateTypeScriptPlanetShell(shell, 6000);
    assert.equal(shell.userData.tsShellUniforms.tsShellTime.value, 0.25);
    updateTypeScriptPlanetShell(shell, 30000);
    assert.equal(shell.userData.tsShellUniforms.tsShellTime.value, 0.25);
});
