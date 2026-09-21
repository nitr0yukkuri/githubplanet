import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createLuaPlanetMaterial,
    createLuaPlanetMoonlight,
    isLuaPlanet,
    updateLuaPlanetMoonlight
} from '../front/js/lua-planet-moonlight.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
        this.userData = {};
    }
}

class FakeShaderMaterial extends FakeMaterial {}

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
        this.renderOrder = 0;
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
    ShaderMaterial: FakeShaderMaterial,
    SphereGeometry: FakeSphereGeometry,
    Mesh: FakeMesh,
    Group: FakeGroup,
    AdditiveBlending: 'additive',
    FrontSide: 'front',
    BackSide: 'back'
};

test('matches only Lua after normalizing the main language', () => {
    assert.equal(isLuaPlanet({ mainLanguage: ' Lua ' }), true);
    assert.equal(isLuaPlanet({ mainLanguage: 'LUA' }), true);
    assert.equal(isLuaPlanet({ mainLanguage: 'JavaScript' }), false);
    assert.equal(isLuaPlanet({ mainLanguage: 'LuaJIT' }), false);
});

test('keeps Mars map and AO while converting the surface to white relief', () => {
    const texture = {};
    const material = createLuaPlanetMaterial(THREE, texture);
    const shader = {
        uniforms: {},
        fragmentShader: '#include <common>\n#include <map_fragment>'
    };

    material.onBeforeCompile(shader);

    assert.equal(material.map, texture);
    assert.equal(material.aoMap, texture);
    assert.equal(material.color, 0xffffff);
    assert.equal(material.customProgramCacheKey(), 'lua-white-planet-moonlight-v1');
    assert.ok(shader.uniforms.luaMoonlightTime);
    assert.match(shader.fragmentShader, /luaWhiteSurface/);
    assert.match(shader.fragmentShader, /pow\(luaTerrainRelief, 0\.86\)/);
    assert.match(shader.fragmentShader, /diffuseColor\.rgb = vec3\(luaWhiteSurface\)/);
});

test('uses a shared white moonlight uniform and updates it over time', () => {
    const material = createLuaPlanetMaterial(THREE, {});
    const moonlight = createLuaPlanetMoonlight(
        THREE,
        2,
        material.userData.luaMoonlightUniforms
    );

    assert.equal(moonlight.children.length, 2);
    assert.equal(
        moonlight.userData.luaMoonlightUniforms,
        material.userData.luaMoonlightUniforms
    );
    assert.match(moonlight.children[0].material.fragmentShader, /vec3\(1\.0\)/);

    updateLuaPlanetMoonlight(material, 1000);
    const firstValue = material.userData.luaMoonlightUniforms.luaMoonlightTime.value;
    updateLuaPlanetMoonlight(material, 2000);
    const secondValue = material.userData.luaMoonlightUniforms.luaMoonlightTime.value;
    assert.equal(firstValue, 0);
    assert.ok(secondValue > firstValue);
});

