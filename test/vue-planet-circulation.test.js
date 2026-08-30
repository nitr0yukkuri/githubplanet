import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
    createVueLeafWind,
    isVuePlanet,
    updateVueLeafWind
} from '../front/js/vue-planet-circulation.js';
import {
    createGoPlanetAtmosphere,
    createGoPlanetWindMaterial
} from '../front/js/go-planet-wind.js';
import { resolvePlanetFeature } from '../front/js/planet-features/registry.js';

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
    }

    add(child) {
        this.children.push(child);
    }
}

class FakeMesh {
    constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
        this.userData = {};
    }
}

class FakeGeometry {}

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

const MATERIAL_THREE = { MeshStandardMaterial: FakeMaterial };
const ATMOSPHERE_THREE = {
    Group: FakeGroup,
    Mesh: FakeMesh,
    ShaderMaterial: FakeMaterial,
    SphereGeometry: FakeGeometry,
    AdditiveBlending: 'additive',
    BackSide: 'back'
};
const LEAF_THREE = {
    BufferGeometry: FakeBufferGeometry,
    BufferAttribute: FakeBufferAttribute,
    ShaderMaterial: FakeMaterial,
    Points: FakeMesh
};

test('matches only normalized Vue planets', () => {
    assert.equal(isVuePlanet({ mainLanguage: 'Vue' }), true);
    assert.equal(isVuePlanet({ mainLanguage: ' vue ' }), true);
    assert.equal(isVuePlanet({ mainLanguage: 'Vue.js' }), false);
    assert.equal(isVuePlanet({ mainLanguage: 'Go' }), false);
});

test('routes Vue planets through the shared feature boundary', () => {
    const feature = resolvePlanetFeature({ mainLanguage: 'Vue' });

    assert.ok(feature);
    assert.equal(feature.id, 'vue');
    assert.equal(feature.usesWindSpeed, true);
    assert.equal(feature.rotationMultiplier, 0.7);
    assert.equal(feature.windAnimationMultiplier, 0.5);

    const material = feature.createMaterial({
        THREE: MATERIAL_THREE,
        planetTexture: {},
        direction: 1
    });
    assert.equal(material.customProgramCacheKey(), 'go-planet-oblique-gale-v2-vue');

    const objects = feature.createObjects({
        THREE: { ...ATMOSPHERE_THREE, ...LEAF_THREE },
        radius: 4,
        direction: 1
    });
    assert.ok(objects.atmosphere);
    assert.ok(objects.leaves);
});

test('changes only the shared Go effect palette for Vue', () => {
    const material = createGoPlanetWindMaterial(MATERIAL_THREE, {}, 1, 'vue');
    const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader: '#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>'
    };
    material.onBeforeCompile(shader);
    const atmosphere = createGoPlanetAtmosphere(ATMOSPHERE_THREE, 4, 1, 'vue');

    assert.match(shader.fragmentShader, /vec3\(0\.255, 0\.72, 0\.51\)/);
    assert.match(shader.fragmentShader, /vec3\(0\.68, 0\.98, 0\.82\)/);
    assert.match(atmosphere.children[0].material.fragmentShader, /vec3\(0\.28, 0\.76, 0\.52\)/);
    assert.match(atmosphere.children[1].material.fragmentShader, /vec3\(0\.2, 0\.68, 0\.44\)/);
});

test('creates six non-glowing leaves that follow the Vue wind', () => {
    const leaves = createVueLeafWind(LEAF_THREE, 4);

    assert.equal(leaves.geometry.attributes.leafSeed.array.length, 6);
    assert.equal(leaves.material.transparent, true);
    assert.equal(leaves.material.depthWrite, false);
    assert.match(leaves.material.fragmentShader, /leafShape/);
    assert.match(leaves.material.fragmentShader, /vein/);
    assert.doesNotMatch(leaves.material.fragmentShader, /Additive|emissive/i);

    updateVueLeafWind(leaves, 1000, 0.5);
    updateVueLeafWind(leaves, 2000, 0.5);
    assert.equal(leaves.userData.vueLeafUniforms.vueLeafTime.value, 0.8);
});

test('keeps Vue motion and wind configuration in the shared feature registry', () => {
    const vue = resolvePlanetFeature({ mainLanguage: 'Vue' });
    const go = resolvePlanetFeature({ mainLanguage: 'Go' });

    assert.ok(vue);
    assert.ok(go);
    assert.equal(vue.rotationMultiplier, 0.7);
    assert.equal(vue.windAnimationMultiplier, 0.5);
    assert.equal(vue.usesWindSpeed, true);
    assert.equal(go.rotationMultiplier, undefined);
    assert.equal(go.windAnimationMultiplier, undefined);
});

test('uses one Vue feature definition for home and card rendering', () => {
    const vue = resolvePlanetFeature({ mainLanguage: 'Vue' });
    const home = readFileSync(new URL('../front/js/home.js', import.meta.url), 'utf8');
    const card = readFileSync(new URL('../front/js/card.js', import.meta.url), 'utf8');

    assert.ok(vue);
    assert.equal(vue.id, 'vue');
    assert.equal(vue.module.isVuePlanet({ mainLanguage: 'Vue' }), true);
    assert.match(home, /createPlanetFeatureRuntime/);
    assert.match(card, /createPlanetFeatureRuntime/);
    assert.doesNotMatch(home, /createVuePlanetFlow|createVuePlanetRimWind|updateVuePlanetFlow/);
    assert.doesNotMatch(card, /createVuePlanetFlow|createVuePlanetRimWind|updateVuePlanetFlow/);
});
