import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createGoPlanetAtmosphere,
    createGoPlanetWindMaterial,
    isGoPlanet,
    updateGoPlanetAtmosphere,
    updateGoPlanetWind
} from '../front/js/go-planet-wind.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
        this.userData = {};
    }
}

class FakeGroup {
    constructor() {
        this.children = [];
        this.userData = {};
        this.rotation = { y: 0 };
    }

    add(child) {
        this.children.push(child);
    }
}

class FakeMesh {
    constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
        this.rotation = { set(...values) { this.values = values; } };
    }
}

class FakeGeometry {
    constructor(...args) {
        this.args = args;
    }
}

const THREE = { MeshStandardMaterial: FakeMaterial };
const ATMOSPHERE_THREE = {
    Group: FakeGroup,
    Mesh: FakeMesh,
    ShaderMaterial: FakeMaterial,
    SphereGeometry: FakeGeometry,
    TorusGeometry: FakeGeometry,
    AdditiveBlending: 'additive',
    BackSide: 'back'
};

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

test('builds and updates an external atmosphere with three moving wind tails', () => {
    const atmosphere = createGoPlanetAtmosphere(ATMOSPHERE_THREE, 4);

    assert.equal(atmosphere.children.length, 4);
    assert.deepEqual(atmosphere.children[0].geometry.args, [4.4, 48, 48]);
    assert.equal(atmosphere.children[1].material.depthWrite, false);

    updateGoPlanetAtmosphere(atmosphere, 5000);
    assert.equal(atmosphere.userData.goAtmosphereUniforms.goAtmosphereTime.value, 0);
    updateGoPlanetAtmosphere(atmosphere, 6250);
    assert.equal(atmosphere.userData.goAtmosphereUniforms.goAtmosphereTime.value, 1.25);
    assert.equal(atmosphere.rotation.y, 0);
});
