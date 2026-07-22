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
    BackSide: 'back'
};

test('matches only normalized TypeScript planets', () => {
    assert.equal(isTypeScriptPlanet({ mainLanguage: 'TypeScript' }), true);
    assert.equal(isTypeScriptPlanet({ mainLanguage: ' typescript ' }), true);
    assert.equal(isTypeScriptPlanet({ mainLanguage: 'JavaScript' }), false);
    assert.equal(isTypeScriptPlanet({ mainLanguage: 'TypeScript React' }), false);
});

test('keeps the textured terrain while adding a narrowing surface pass', () => {
    const texture = { id: 'mars-terrain' };
    const material = createTypeScriptPlanetMaterial(THREE, texture);

    assert.equal(material.color, '#007acc');
    assert.equal(material.map, undefined);
    assert.equal(material.aoMap, texture);
    assert.equal(material.aoMapIntensity, 1.5);
    assert.equal(material.roughness, 0.8);
    assert.equal(material.metalness, 0.2);
    assert.equal(typeof material.onBeforeCompile, 'function');
    assert.equal(material.customProgramCacheKey(), 'typescript-planet-type-narrowing-v2');

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
    assert.match(shader.vertexShader, /vTsNarrowingPosition/);
    assert.match(shader.fragmentShader, /tsCandidate/);
    assert.doesNotMatch(shader.fragmentShader, /tsConfirmedBoundary/);
    assert.match(shader.fragmentShader, /tsWidth = mix\(0\.3, 0\.055, tsFocus\)/);
});

test('builds three back-facing defensive layers outside the untouched planet', () => {
    const shell = createTypeScriptPlanetShell(THREE, 4);

    assert.equal(shell.children.length, 3);
    assert.deepEqual(shell.children[0].geometry.args, [4.32, 48, 48]);
    assert.deepEqual(shell.children[1].geometry.args, [4.5, 48, 48]);
    assert.deepEqual(shell.children[2].geometry.args, [4.66, 48, 48]);
    shell.children.forEach((layer) => {
        assert.equal(layer.material.transparent, true);
        assert.equal(layer.material.depthWrite, false);
        assert.equal(layer.material.side, 'back');
        assert.match(layer.material.fragmentShader, /fixedStructure/);
        assert.match(layer.material.fragmentShader, /junction/);
        assert.match(layer.material.fragmentShader, /validationA/);
        assert.match(layer.material.fragmentShader, /typedGuardRim/);
        assert.match(layer.material.fragmentShader, /guardedStructureLayer/);
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
