import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    createSwiftPlanetFeathers,
    isSwiftPlanet,
    updateSwiftPlanetFeathers
} from '../front/js/swift-planet-feathers.js';
import { createGoPlanetWindMaterial } from '../front/js/go-planet-wind.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
        this.userData = {};
    }
}

class FakeBufferGeometry {
    constructor() {
        this.attributes = {};
    }

    setAttribute(name, value) {
        this.attributes[name] = value;
    }
}

class FakeBufferAttribute {
    constructor(array, itemSize) {
        this.array = array;
        this.itemSize = itemSize;
    }
}

class FakePoints {
    constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
        this.userData = {};
    }
}

const THREE = {
    BufferGeometry: FakeBufferGeometry,
    BufferAttribute: FakeBufferAttribute,
    ShaderMaterial: FakeMaterial,
    MeshStandardMaterial: FakeMaterial,
    Points: FakePoints
};

test('matches only normalized Swift planets', () => {
    assert.equal(isSwiftPlanet({ mainLanguage: 'Swift' }), true);
    assert.equal(isSwiftPlanet({ mainLanguage: ' swift ' }), true);
    assert.equal(isSwiftPlanet({ mainLanguage: 'SwiftUI' }), false);
    assert.equal(isSwiftPlanet({ mainLanguage: 'Go' }), false);
});

test('creates five red wind feathers that follow the oblique wind', () => {
    const feathers = createSwiftPlanetFeathers(THREE, 4, -1);

    assert.equal(feathers.geometry.attributes.featherSeed.array.length, 5);
    assert.equal(feathers.material.transparent, true);
    assert.equal(feathers.material.depthWrite, false);
    assert.match(feathers.material.fragmentShader, /featherShape/);
    assert.match(feathers.material.fragmentShader, /shaft/);
    assert.equal(feathers.userData.swiftFeatherUniforms.swiftWindDirection.value, -1);
    assert.match(feathers.material.fragmentShader, /vec3\(0\.72, 0\.018, 0\.01\)/);
    assert.match(feathers.material.fragmentShader, /vec3\(1\.0, 0\.16, 0\.04\)/);
    assert.match(feathers.material.vertexShader, /1\.28 \+ featherSeed \* 0\.22/);

    updateSwiftPlanetFeathers(feathers, 1000);
    updateSwiftPlanetFeathers(feathers, 2250);
    assert.equal(feathers.userData.swiftFeatherUniforms.swiftFeatherTime.value, 1.9);
});

test('routes Swift through the shared Go wind with a Swift palette', () => {
    const card = readFileSync(new URL('../front/js/card.js', import.meta.url), 'utf8');
    const home = readFileSync(new URL('../front/js/home.js', import.meta.url), 'utf8');
    const registry = readFileSync(
        new URL('../front/js/planet-features/registry.js', import.meta.url),
        'utf8'
    );

    for (const source of [card, home]) {
        assert.match(source, /createPlanetFeatureRuntime/);
        assert.match(source, /planetFeatureRuntime\?\.sceneObjects/);
        assert.match(source, /planetFeatureRuntime\?\.update/);
    }
    assert.match(registry, /id: 'swift'[\s\S]*createGoPlanetWindMaterial/);
    assert.match(registry, /id: 'swift'[\s\S]*createSwiftPlanetFeathers/);
    assert.match(registry, /id: 'swift'[\s\S]*updateSwiftPlanetFeathers/);

    const swiftMaterial = createGoPlanetWindMaterial(THREE, {}, 1, 'swift');
    const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader: '#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>'
    };
    swiftMaterial.onBeforeCompile(shader);
    assert.match(shader.fragmentShader, /vec3\(0\.82, 0\.14, 0\.09\)/);
    assert.match(shader.fragmentShader, /vec3\(1\.0, 0\.42, 0\.28\)/);
    assert.match(shader.fragmentShader, /\* 1\.35/);
    assert.match(shader.fragmentShader, /goWindStreak \* 0\.11/);
    assert.match(shader.fragmentShader, /goRimGust \* 0\.052/);
});
