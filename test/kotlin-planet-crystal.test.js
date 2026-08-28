import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createKotlinPlanetMaterial,
    isKotlinPlanet,
    updateKotlinPlanetCrystal
} from '../front/js/kotlin-planet-crystal.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
        this.userData = {};
    }
}

const THREE = { MeshStandardMaterial: FakeMaterial };

test('matches only normalized Kotlin planets', () => {
    assert.equal(isKotlinPlanet({ mainLanguage: 'Kotlin' }), true);
    assert.equal(isKotlinPlanet({ mainLanguage: ' kotlin ' }), true);
    assert.equal(isKotlinPlanet({ mainLanguage: 'Kotlin Script' }), false);
    assert.equal(isKotlinPlanet({ mainLanguage: 'Java' }), false);
});

test('preserves Mars terrain beneath a glittering sparkle surface', () => {
    const texture = { id: 'mars-terrain' };
    const material = createKotlinPlanetMaterial(THREE, texture);

    assert.equal(material.color, '#A97BFF');
    assert.equal(material.map, texture);
    assert.equal(material.aoMap, texture);
    assert.equal(material.roughness, 0.24);
    assert.equal(material.metalness, 0.22);
    assert.equal(material.customProgramCacheKey(), 'kotlin-planet-lightning-v1');

    assert.equal(material.onBeforeCompile, undefined);
});

test('updates on a seamless six-second lightning cycle', () => {
    const material = createKotlinPlanetMaterial(THREE, {});

    updateKotlinPlanetCrystal(material, 4000);
    assert.equal(material.userData.kotlinSparkUniforms.kotlinSparkTime.value, 4 / 6);
    updateKotlinPlanetCrystal(material, 24000);
    assert.equal(material.userData.kotlinSparkUniforms.kotlinSparkTime.value, 0);
    updateKotlinPlanetCrystal(null, 4000);
});

test('routes Kotlin through the shared material on cards', async () => {
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

    assert.match(registry, /id: 'kotlin'[\s\S]*createKotlinPlanetMaterial/);
    assert.match(registry, /id: 'kotlin'[\s\S]*createKotlinElectricity/);
    assert.match(registry, /id: 'kotlin'[\s\S]*updateKotlinPlanetCrystal/);
    assert.match(registry, /id: 'kotlin'[\s\S]*updateKotlinElectricity/);
});
