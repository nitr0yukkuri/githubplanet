import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createCppPlanetLightningMaterial,
    isCppPlanet,
    updateCppPlanetLightning
} from '../front/js/cpp-planet-lightning.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
        this.userData = {};
    }
}

const THREE = { MeshStandardMaterial: FakeMaterial };

test('matches only normalized C++ planets', () => {
    assert.equal(isCppPlanet({ mainLanguage: 'C++' }), true);
    assert.equal(isCppPlanet({ mainLanguage: ' c++ ' }), true);
    assert.equal(isCppPlanet({ mainLanguage: 'C#' }), false);
    assert.equal(isCppPlanet({ mainLanguage: 'CSS' }), false);
});

test('injects thin continuously drifting idle plasma filaments without mouse uniforms', () => {
    const texture = { id: 'terrain' };
    const material = createCppPlanetLightningMaterial(THREE, texture, '#f34b7d');
    const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <defaultnormal_vertex>',
        fragmentShader: '#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>'
    };

    material.onBeforeCompile(shader);

    assert.equal(material.aoMap, texture);
    assert.equal(material.color, '#f34b7d');
    assert.match(shader.vertexShader, /vCppLightningPosition = transformedNormal/);
    assert.match(shader.vertexShader, /vCppModelViewX = modelViewMatrix\[0\]\.xyz/);
    assert.match(shader.fragmentShader, /cppIndex < 7/);
    assert.match(shader.fragmentShader, /cppBaseAngle = cppIndexValue \* 2\.39996322973/);
    assert.match(shader.fragmentShader, /cppModelViewRotation \* cppObjectDirection/);
    assert.match(shader.fragmentShader, /cppLightningSmoothNoise/);
    assert.match(shader.fragmentShader, /cppNaturalBend/);
    assert.match(shader.fragmentShader, /cppFineBend/);
    assert.match(shader.fragmentShader, /cppOuterTurn/);
    assert.match(shader.fragmentShader, /cppTrunkMask/);
    assert.match(shader.fragmentShader, /cppTravelPulse/);
    assert.match(shader.fragmentShader, /cppRimSparkStrength/);
    assert.doesNotMatch(shader.fragmentShader, /cppLocalWander|cppCoarseBend|cppRootTwist/);
    assert.match(shader.fragmentShader, /cppSlowDrift/);
    assert.match(shader.fragmentShader, /cppFineFlicker/);
    assert.match(shader.fragmentShader, /cppFilamentPresence/);
    assert.match(shader.fragmentShader, /cppBranchDistanceA/);
    assert.match(shader.fragmentShader, /cppBranchDistanceB/);
    assert.match(shader.fragmentShader, /cppBranchCoreA/);
    assert.match(shader.fragmentShader, /cppBranchCoreB/);
    assert.doesNotMatch(shader.fragmentShader, /cppCrackleFrame|cppSharpBend|cppMicroBend|cppTwig/);
    assert.match(shader.fragmentShader, /cppBranchEnabled/);
    assert.match(shader.fragmentShader, /cppContactStrength/);
    assert.match(shader.fragmentShader, /cppElectrodeHot/);
    assert.match(shader.fragmentShader, /cppElectrodeCore/);
    assert.match(shader.fragmentShader, /cppCoreBeat/);
    assert.match(shader.fragmentShader, /cppCoreSparkSway/);
    assert.match(shader.fragmentShader, /cppCoreSparkStrength/);
    assert.doesNotMatch(shader.fragmentShader, /cppCoreFrame/);
    assert.match(shader.fragmentShader, /cppElectrodeLayerColor/);
    assert.match(shader.fragmentShader, /cppElectrodeHotColor/);
    assert.match(shader.fragmentShader, /cppCoreCoronaColor/);
    assert.match(shader.fragmentShader, /cppFilamentColor/);
    assert.match(shader.fragmentShader, /cppContactColor/);
    assert.match(shader.fragmentShader, /cppPlasmaStrength/);
    assert.doesNotMatch(shader.fragmentShader, /mouse/i);
    assert.equal(shader.uniforms.cppLightningTime, material.userData.cppLightningUniforms.cppLightningTime);
});

test('updates discharge time in seconds', () => {
    const material = createCppPlanetLightningMaterial(THREE, {}, '#f34b7d');
    updateCppPlanetLightning(material, 5250);
    assert.equal(material.userData.cppLightningUniforms.cppLightningTime.value, 0);
    updateCppPlanetLightning(material, 6500);
    assert.equal(material.userData.cppLightningUniforms.cppLightningTime.value, 1.25);
});
