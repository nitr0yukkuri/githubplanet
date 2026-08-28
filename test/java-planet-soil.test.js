import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createJavaPlanetDust,
    createJavaPlanetMaterial,
    isJavaPlanet,
    updateJavaPlanetSoil
} from '../front/js/java-planet-soil.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
        this.userData = {};
    }
}

class FakeGeometry {
    constructor() {
        this.attributes = {};
    }

    setAttribute(name, attribute) {
        this.attributes[name] = attribute;
    }
}

class FakeAttribute {
    constructor(array, itemSize) {
        this.array = array;
        this.itemSize = itemSize;
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

class FakePoints {
    constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
    }
}

const THREE = {
    BufferAttribute: FakeAttribute,
    BufferGeometry: FakeGeometry,
    Group: FakeGroup,
    MeshStandardMaterial: FakeMaterial,
    NormalBlending: 'normal',
    Points: FakePoints,
    ShaderMaterial: FakeMaterial
};

test('matches only normalized Java planets', () => {
    assert.equal(isJavaPlanet({ mainLanguage: 'Java' }), true);
    assert.equal(isJavaPlanet({ mainLanguage: ' java ' }), true);
    assert.equal(isJavaPlanet({ mainLanguage: 'JavaScript' }), false);
    assert.equal(isJavaPlanet({ mainLanguage: 'Kotlin' }), false);
});

test('uses a dark, rough soil material while preserving terrain texture', () => {
    const texture = { id: 'mars-terrain' };
    const material = createJavaPlanetMaterial(THREE, texture);

    assert.equal(material.color, '#b07219');
    assert.equal(material.map, texture);
    assert.equal(material.aoMap, texture);
    assert.equal(material.roughness, 0.92);
    assert.equal(material.metalness, 0.04);
    assert.equal(material.customProgramCacheKey(), 'java-planet-settled-soil-v1');
    assert.equal(material.onBeforeCompile, undefined);
});

test('creates non-emissive surface dust and moves it only subtly', () => {
    const dust = createJavaPlanetDust(THREE, 4);
    const points = dust.children[0];

    assert.equal(dust.children.length, 1);
    assert.equal(points.geometry.attributes.position.array.length, 5200 * 3);
    assert.equal(points.geometry.attributes.javaSoilSeed.itemSize, 1);
    assert.equal(points.geometry.attributes.javaSoilSize.itemSize, 1);
    assert.equal(points.material.blending, 'normal');
    assert.match(points.material.vertexShader, /javaSoilTime/);
    assert.match(points.material.fragmentShader, /darkSoil/);

    updateJavaPlanetSoil(dust, 1000);
    assert.equal(dust.userData.javaSoilUniforms.javaSoilTime.value, 0);
    updateJavaPlanetSoil(dust, 2500);
    assert.equal(dust.userData.javaSoilUniforms.javaSoilTime.value, 1.5);
});

test('routes Java through the soil feature on cards and home', async () => {
    const { readFile } = await import('node:fs/promises');
    const [card, home, registry] = await Promise.all([
        readFile(new URL('../front/js/card.js', import.meta.url), 'utf8'),
        readFile(new URL('../front/js/home.js', import.meta.url), 'utf8'),
        readFile(new URL('../front/js/planet-features/registry.js', import.meta.url), 'utf8')
    ]);

    for (const source of [card, home]) {
        assert.match(source, /createPlanetFeatureRuntime/);
        assert.match(source, /planetFeatureRuntime\?\.sceneObjects/);
        assert.match(source, /planetFeatureRuntime\?\.update/);
    }

    assert.match(registry, /id: 'java'[\s\S]*createJavaPlanetMaterial/);
    assert.match(registry, /id: 'java'[\s\S]*createJavaPlanetDust/);
    assert.match(registry, /id: 'java'[\s\S]*updateJavaPlanetSoil/);
});
