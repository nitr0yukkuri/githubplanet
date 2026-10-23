import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createShellPlanetClouds,
    createShellPlanetMaterial,
    isShellPlanet,
    updateShellPlanetClouds
} from '../front/js/shell-planet-clouds.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
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

class FakeMesh {
    constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
    }
}

class FakeSphereGeometry {
    constructor(...args) {
        this.args = args;
    }
}

const THREE = {
    BackSide: 'back',
    FrontSide: 'front',
    Mesh: FakeMesh,
    MeshStandardMaterial: FakeMaterial,
    NormalBlending: 'normal',
    ShaderMaterial: FakeMaterial,
    SphereGeometry: FakeSphereGeometry,
    Group: FakeGroup
};

test('matches only normalized Shell planets', () => {
    assert.equal(isShellPlanet({ mainLanguage: 'Shell' }), true);
    assert.equal(isShellPlanet({ mainLanguage: ' shell ' }), true);
    assert.equal(isShellPlanet({ mainLanguage: 'Bash' }), false);
});

test('keeps Mars relief under the white terrain tint and shares a cloud-shadow clock', () => {
    const texture = { id: 'mars-terrain' };
    const material = createShellPlanetMaterial(THREE, texture);
    const shader = {
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader: '#include <common>\n#include <map_fragment>\nvoid main() {}',
        uniforms: {}
    };

    assert.equal(material.color, 0xffffff);
    assert.equal(material.map, texture);
    assert.equal(material.aoMap, texture);
    assert.equal(material.aoMapIntensity, 0.92);
    assert.equal(material.roughness, 0.84);
    assert.equal(material.metalness, 0.12);
    material.onBeforeCompile(shader);
    assert.match(shader.fragmentShader, /shellMappedTexture/);
    assert.match(shader.fragmentShader, /shellTerrainRelief/);
    assert.match(shader.fragmentShader, /shellPaleTerrain/);
    assert.match(shader.fragmentShader, /shellCloudShadow/);
    assert.match(shader.fragmentShader, /shellCloudNoise/);
    assert.equal(
        shader.uniforms.shellCloudTime,
        material.userData.shellCloudUniforms.shellCloudTime
    );
    assert.equal(
        material.customProgramCacheKey(),
        'shell-planet-terrain-v4-white-relief-cloud-shadow'
    );
});

test('builds one fluffy cloud shell with transparent gaps and sun-facing shading', () => {
    const clouds = createShellPlanetClouds(THREE, 4, 0.8);

    assert.equal(clouds.children.length, 1);
    assert.deepEqual(
        clouds.children.map(({ geometry }) => geometry.args[0]),
        [4.072]
    );
    assert.match(clouds.children[0].material.fragmentShader, /cloudMass/);
    assert.match(clouds.children[0].material.fragmentShader, /shellCloudDensity/);
    assert.match(clouds.children[0].material.fragmentShader, /shellCloudFlowPosition/);
    assert.match(clouds.children[0].material.fragmentShader, /shellCloudLightShadow/);
    assert.match(clouds.children[0].material.fragmentShader, /opticalDepth/);
    assert.match(clouds.children[0].material.fragmentShader, /forwardScatter/);
    assert.match(clouds.children[0].material.fragmentShader, /shellCloudSunDirection/);
    assert.match(clouds.children[0].material.fragmentShader, /limbFade/);
    assert.match(clouds.children[0].material.fragmentShader, /discard/);
    assert.match(clouds.children[0].material.fragmentShader, /vec3\(0\.96, 0\.98, 1\.0\)/);
    assert.equal(
        clouds.children[0].material.customProgramCacheKey(),
        'shell-planet-clouds-v19-fragment-shadow-uniform'
    );
});

test('keeps shadow samples in object space while lighting uses the view-space direction', () => {
    const clouds = createShellPlanetClouds(THREE, 4, 1);
    const material = clouds.children[0].material;
    const source = material.vertexShader + '\n' + material.fragmentShader;

    assert.match(
        source,
        /vShellCloudSunDirection = normalize\(normalMatrix \* shellCloudSunDirection\)/
    );
    assert.match(
        source,
        /dot\(vShellCloudNormal, vShellCloudSunDirection\)/
    );
    assert.match(
        source,
        /shellCloudLightShadow\(\s*vShellCloudPosition,\s*shellCloudTime,\s*shellCloudSunDirection\s*\)/
    );
    assert.doesNotMatch(
        source,
        /shellCloudLightShadow\(\s*vShellCloudPosition,\s*shellCloudTime,\s*vShellCloudSunDirection\s*\)/
    );
});

test('can reuse the terrain clock for synchronized cloud shadows', () => {
    const material = createShellPlanetMaterial(THREE, { id: 'mars-terrain' });
    const clouds = createShellPlanetClouds(
        THREE,
        4,
        1,
        material.userData.shellCloudUniforms
    );

    assert.equal(
        clouds.userData.shellCloudUniforms,
        material.userData.shellCloudUniforms
    );
    updateShellPlanetClouds(clouds, 16000);
    assert.equal(clouds.userData.shellCloudUniforms.shellCloudTime.value, 0.5);
});

