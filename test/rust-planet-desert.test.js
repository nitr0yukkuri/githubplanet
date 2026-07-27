import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createRustPlanetDust,
    createRustPlanetMaterial,
    isRustPlanet,
    updateRustPlanetDesert
} from '../front/js/rust-planet-desert.js';

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

    setAttribute(name, value) {
        this.attributes[name] = value;
    }
}

class FakeAttribute {
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
    constructor(radius, widthSegments, heightSegments) {
        this.radius = radius;
        this.widthSegments = widthSegments;
        this.heightSegments = heightSegments;
    }
}

const THREE = {
    MeshStandardMaterial: FakeMaterial,
    ShaderMaterial: FakeMaterial,
    BufferGeometry: FakeGeometry,
    BufferAttribute: FakeAttribute,
    Points: FakePoints,
    Group: FakeGroup,
    Mesh: FakeMesh,
    SphereGeometry: FakeSphereGeometry,
    NormalBlending: 'normal',
    FrontSide: 'front',
    BackSide: 'back'
};

test('matches only normalized Rust planets', () => {
    assert.equal(isRustPlanet({ mainLanguage: 'Rust' }), true);
    assert.equal(isRustPlanet({ mainLanguage: ' rust ' }), true);
    assert.equal(isRustPlanet({ mainLanguage: 'Go' }), false);
    assert.equal(isRustPlanet({ mainLanguage: 'C++' }), false);
});

test('keeps the terrain texture while adding rust and deposited sand', () => {
    const texture = { id: 'terrain' };
    const material = createRustPlanetMaterial(THREE, texture);
    const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader: '#include <common>\n#include <map_fragment>'
    };

    material.onBeforeCompile(shader);

    assert.equal(material.map, texture);
    assert.equal(material.aoMap, texture);
    assert.equal(material.roughness, 0.78);
    assert.equal(material.metalness, 0.26);
    assert.match(shader.fragmentShader, /rustMappedTexture/);
    assert.match(shader.fragmentShader, /rustCraterDepth/);
    assert.match(shader.fragmentShader, /rustSandDeposit/);
    assert.match(shader.fragmentShader, /rustShortGrain/);
    assert.match(shader.fragmentShader, /rustOxidePatch/);
    assert.doesNotMatch(shader.fragmentShader, /goWake|goAtmosphere|lightning/i);
});

test('creates sparse surface dust that lifts briefly and returns', () => {
    const dust = createRustPlanetDust(THREE, 4);
    const [surfaceDust, outerDust, farDust, dustPoints] = dust.children;

    assert.equal(dust.children.length, 4);
    assert.equal(dustPoints.geometry.attributes.position.array.length, 1800 * 3);
    assert.equal(dustPoints.geometry.attributes.rustDustTangent.itemSize, 3);
    assert.equal(dustPoints.geometry.attributes.rustDustSeed.itemSize, 1);
    assert.match(dustPoints.material.vertexShader, /float lift/);
    assert.match(dustPoints.material.vertexShader, /float drift/);
    assert.match(dustPoints.material.vertexShader, /float coarse/);
    assert.match(dustPoints.material.vertexShader, /stormBand/);
    assert.match(dustPoints.material.vertexShader, /vRustDustScreenTangent/);
    assert.match(dustPoints.material.fragmentShader, /orientedPoint/);
    assert.match(dustPoints.material.vertexShader, /sin\(clamp\(life \/ 0\.72/);
    assert.doesNotMatch(dustPoints.material.vertexShader, /goWake|tail/i);
    assert.equal(surfaceDust.material.side, 'front');
    assert.equal(outerDust.material.side, 'back');
    assert.equal(farDust.material.side, 'back');
    assert.equal(outerDust.material.uniforms.rustDustOuterLayer.value, 1);
    assert.match(surfaceDust.material.fragmentShader, /flowBand/);
    assert.match(surfaceDust.material.fragmentShader, /rustDustTime \* 0\.95/);
    assert.match(surfaceDust.material.fragmentShader, /grainCoordinate/);
    assert.match(surfaceDust.material.fragmentShader, /grainParticle/);
    assert.match(surfaceDust.material.fragmentShader, /fineParticle/);
    assert.match(surfaceDust.material.fragmentShader, /cloudBreakup/);
    assert.match(outerDust.material.fragmentShader, /gustExposure/);
    assert.equal(outerDust.material.uniforms.rustDustOpacity.value, 0.34);
    assert.equal(farDust.material.uniforms.rustDustOpacity.value, 0.08);
    assert.doesNotMatch(surfaceDust.material.fragmentShader, /brokenBand|windFilament/);
    assert.match(outerDust.material.fragmentShader, /outerAlpha/);
    assert.doesNotMatch(outerDust.material.fragmentShader, /goWake|tail/i);

    updateRustPlanetDesert(dust, 1000);
    assert.equal(dust.userData.rustDustUniforms.rustDustTime.value, 0);
    updateRustPlanetDesert(dust, 2500);
    assert.equal(dust.userData.rustDustUniforms.rustDustTime.value, 1.5);
});

test('updates the terrain animation from its own start time', () => {
    const material = createRustPlanetMaterial(THREE, {});

    updateRustPlanetDesert(material, 5000);
    assert.equal(material.userData.rustDesertUniforms.rustDesertTime.value, 0);
    updateRustPlanetDesert(material, 6750);
    assert.equal(material.userData.rustDesertUniforms.rustDesertTime.value, 1.75);
});
