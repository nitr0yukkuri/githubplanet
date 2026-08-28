import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    createRubyPlanetMaterial,
    isRubyPlanet,
    updateRubyPlanetSolar
} from '../front/js/ruby-planet-solar.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
        this.userData = {};
    }
}

const THREE = { MeshStandardMaterial: FakeMaterial };

test('matches only normalized Ruby planets', () => {
    assert.equal(isRubyPlanet({ mainLanguage: 'Ruby' }), true);
    assert.equal(isRubyPlanet({ mainLanguage: ' ruby ' }), true);
    assert.equal(isRubyPlanet({ mainLanguage: 'Ruby on Rails' }), false);
    assert.equal(isRubyPlanet({ mainLanguage: 'JavaScript' }), false);
});

test('preserves textured terrain beneath a burning campfire ruby surface', () => {
    const texture = { id: 'mars-terrain' };
    const material = createRubyPlanetMaterial(THREE, texture);

    assert.equal(material.color, '#CC342D');
    assert.equal(material.map, texture);
    assert.equal(material.aoMap, texture);
    assert.equal(material.aoMapIntensity, 0.9);
    assert.equal(material.roughness, 0.32);
    assert.equal(material.metalness, 0.22);
    assert.equal(material.customProgramCacheKey(), 'ruby-planet-anodized-pearl-v41');

    const shader = {
        uniforms: {},
        vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
        fragmentShader: '#include <common>\nvoid main() {\n#include <map_fragment>\n#include <emissivemap_fragment>\n}'
    };
    material.onBeforeCompile(shader);

    assert.match(shader.fragmentShader, /rubyMappedTexture/);
    assert.match(shader.fragmentShader, /diffuseColor\.a = 1\.0/);
    assert.match(shader.fragmentShader, /rubyReliefHeat/);
    assert.doesNotMatch(shader.fragmentShader, /rubyPrimaryCell|rubySecondaryCell/);
    assert.match(shader.fragmentShader, /rubyOrangeSolar/);
    assert.match(shader.fragmentShader, /rubyHotSolar/);
    assert.match(shader.fragmentShader, /rubyFireSource/);
    assert.match(shader.fragmentShader, /rubyFireHalo/);
    assert.match(shader.fragmentShader, /rubyFireContact/);
    assert.doesNotMatch(shader.fragmentShader, /rubySparklePoint|rubySparkleVisibility|rubySparkleColor|rubyFacetGlint/);
    assert.match(shader.fragmentShader, /rubyCoat/);
    assert.match(shader.fragmentShader, /rubyPearlFlake/);
    assert.match(shader.fragmentShader, /rubySparkCell/);
    assert.match(shader.fragmentShader, /rubySparkSpecular/);
    assert.match(shader.fragmentShader, /rubySurfaceSpark/);
    assert.match(shader.fragmentShader, /rubySparkPulse/);
    assert.doesNotMatch(shader.fragmentShader, /diffuseColor\.rgb \+= rubySparkleColor/);
    assert.match(shader.fragmentShader, /rubyMappedTexture, rubyTerrainColor, 0\.64/);
    assert.match(shader.fragmentShader, /rubySolarTime/);
});

test('renders one continuous animated campfire flame', async () => {
    const source = await readFile(
        new URL('../front/js/ruby-planet-solar.js', import.meta.url),
        'utf8'
    );

    assert.match(source, /createFlameSprite/);
    assert.match(source, /new THREE.PlaneGeometry/);
    assert.match(source, /rubyHash31/);
    assert.match(source, /rubyNoise3/);
    assert.match(source, /rubyFlameDensity/);
    assert.match(source, /transmittance/);
    assert.match(source, /createFlameSparks/);
    assert.match(source, /new THREE.Points/);
    assert.match(source, /vRubySparkAlpha/);
    assert.match(source, /rubyFlameSparks/);
    assert.match(source, /rubyFlameAnchor/);
    assert.match(source, /inverseParentQuaternion/);
    assert.match(source, /cameraFacingQuaternion/);
});

test('updates on a seamless eighteen-second solar cycle', () => {
    const material = createRubyPlanetMaterial(THREE, {});

    updateRubyPlanetSolar(material, 3000);
    assert.equal(material.userData.rubySolarUniforms.rubySolarTime.value, 3 / 18);
    updateRubyPlanetSolar(material, 21000);
    assert.equal(material.userData.rubySolarUniforms.rubySolarTime.value, 3 / 18);
});

test('routes Ruby through the shared effect on home and cards', async () => {
    const [home, card, registry] = await Promise.all([
        readFile(new URL('../front/js/home.js', import.meta.url), 'utf8'),
        readFile(new URL('../front/js/card.js', import.meta.url), 'utf8'),
        readFile(new URL('../front/js/planet-features/registry.js', import.meta.url), 'utf8')
    ]);

    for (const source of [home, card]) {
        assert.match(source, /createPlanetFeatureRuntime/);
        assert.match(source, /planetFeatureRuntime\?\.sceneObjects/);
        assert.match(source, /planetFeatureRuntime\?\.update/);
    }

    assert.match(registry, /id: 'ruby'[\s\S]*createRubyPlanetMaterial/);
    assert.match(registry, /id: 'ruby'[\s\S]*createRubyPlanetCorona/);
    assert.match(registry, /id: 'ruby'[\s\S]*updateRubyPlanetSolar/);

    assert.match(home, /if \(starCount > 0\)/);
    assert.match(card, /if \(starCount > 0\)/);
    assert.match(home, /if \(starCount > 0\)/);
    assert.match(card, /if \(auraIntensity > 0\)/);
});
