import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE_RUNTIME from 'three';
import {
    createElmPlanetMaterial,
    isElmPlanet,
    updateElmPlanetVegetation
} from '../front/js/elm-planet-vegetation.js';
import {
    createPlanetFeatureRuntime,
    resolvePlanetFeature
} from '../front/js/planet-features/registry.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
        this.userData = {};
    }
}

const THREE = {
    MeshStandardMaterial: FakeMaterial,
    Color: THREE_RUNTIME.Color,
    Vector3: THREE_RUNTIME.Vector3
};

test('matches only normalized Elm planets', () => {
    assert.equal(isElmPlanet({ mainLanguage: 'Elm' }), true);
    assert.equal(isElmPlanet({ mainLanguage: ' elm ' }), true);
    assert.equal(isElmPlanet({ mainLanguage: 'Elm.js' }), false);
    assert.equal(isElmPlanet({ mainLanguage: 'Vue' }), false);
});

test('keeps Mars albedo visible beneath connected forest canopies and meadows', () => {
    const texture = { id: 'mars-terrain' };
    const material = createElmPlanetMaterial(THREE, texture);
    const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>'
    };

    assert.equal(material.color, '#3f9b55');
    assert.equal(material.map, texture);
    assert.equal(material.aoMap, texture);
    assert.ok(material.aoMapIntensity > 0 && material.aoMapIntensity < 1);
    assert.ok(material.roughness >= 0.9 && material.roughness <= 1);
    assert.equal(material.metalness, 0);
    const baseColor = new THREE_RUNTIME.Color('#3f9b55');
    const inverseDiffuse = material.userData.elmVegetationUniforms.elmInverseDiffuse.value;
    assert.equal(inverseDiffuse.x, 1 / Math.max(baseColor.r, 0.001));
    assert.equal(inverseDiffuse.y, 1 / Math.max(baseColor.g, 0.001));
    assert.equal(inverseDiffuse.z, 1 / Math.max(baseColor.b, 0.001));
    assert.equal(
        material.customProgramCacheKey(),
        'elm-planet-terrain-habitats-v17-sage-light'
    );

    material.onBeforeCompile(shader);

    assert.equal(
        shader.uniforms.elmVegetationTime,
        material.userData.elmVegetationUniforms.elmVegetationTime
    );
    assert.equal(
        shader.uniforms.elmInverseDiffuse,
        material.userData.elmVegetationUniforms.elmInverseDiffuse
    );
    assert.match(shader.vertexShader, /vElmSurfacePosition = normalize\(position\)/);
    assert.match(shader.fragmentShader, /elmTerrainTexture = elmMappedTexture \* elmInverseDiffuse/);
    assert.doesNotMatch(shader.fragmentShader, /elmMappedTexture \/ max\(diffuse/);
    assert.match(shader.fragmentShader, /elmAlbedoLuminance = dot\(elmTerrainTexture/);
    assert.equal(material.extensions.shaderTextureLOD, true);
    assert.match(shader.fragmentShader, /texture2DLodEXT\(map, vMapUv,/);
    // 岩の露出は森の閾値と別の場で決め、草地がすべての地肌を等幅で縁取る退行を防ぐ。
    assert.match(shader.fragmentShader, /elmRockExposure = smoothstep\([^;]*elmRegionalLuminance\)[^;]*elmDryField/);
    assert.match(shader.fragmentShader, /elmOpenSurface = mix\(elmMeadowSurface, elmMarsSurface, elmRockExposure\)/);
    assert.match(shader.fragmentShader, /diffuseColor\.rgb = mix\(elmOpenSurface, elmForestSurface, elmForestMass\)/);
    assert.match(shader.fragmentShader, /elmMeadowPalette \* elmTerrainShade/);
    assert.match(shader.fragmentShader, /elmForestPalette \* elmTerrainShade/);
    assert.match(shader.fragmentShader, /roughnessFactor = mix\(0\.94, 0\.97, elmForestMass\) - elmMeadowMass \* 0\.06/);
    assert.match(shader.fragmentShader, /elmSurfaceHeight = elmAlbedoLuminance/);
    assert.match(shader.fragmentShader, /dFdx\(elmSurfaceHeight\)/);
    assert.match(shader.fragmentShader, /dFdy\(elmSurfaceHeight\)/);
    assert.match(shader.fragmentShader, /normal = normalize\(abs\(elmNormalDeterminant\) \* normal - elmNormalGradient\)/);
    assert.doesNotMatch(shader.fragmentShader, /gl_PointCoord|gl_PointSize|discard;/);
});

test('injects into the installed Three.js standard shader chunks', () => {
    const material = createElmPlanetMaterial(THREE_RUNTIME, new THREE_RUNTIME.Texture());
    const shader = {
        uniforms: {},
        vertexShader: THREE_RUNTIME.ShaderLib.standard.vertexShader,
        fragmentShader: THREE_RUNTIME.ShaderLib.standard.fragmentShader
    };

    material.onBeforeCompile(shader);

    assert.equal(THREE_RUNTIME.REVISION, '160');
    assert.match(shader.vertexShader, /varying vec3 vElmSurfacePosition;/);
    assert.match(shader.vertexShader, /vElmSurfacePosition = normalize\(position\)/);
    assert.match(shader.fragmentShader, /uniform float elmVegetationTime;/);
    assert.match(shader.fragmentShader, /uniform vec3 elmInverseDiffuse;/);
    assert.match(shader.fragmentShader, /#include <map_fragment>[\s\S]*?elmMappedTexture = diffuseColor\.rgb/);
    assert.match(shader.fragmentShader, /diffuseColor\.rgb = mix\(elmOpenSurface, elmForestSurface/);
    assert.match(shader.fragmentShader, /#include <roughnessmap_fragment>[\s\S]*?roughnessFactor = /);
    assert.match(shader.fragmentShader, /#include <normal_fragment_maps>[\s\S]*?dFdx\(elmSurfaceHeight\)/);

    material.dispose();
});

test('updates on a seamless twenty-four-second vegetation cycle', () => {
    const material = createElmPlanetMaterial(THREE, {});

    updateElmPlanetVegetation(material, 6000);
    assert.equal(material.userData.elmVegetationUniforms.elmVegetationTime.value, 0.25);
    updateElmPlanetVegetation(material, 30000);
    assert.equal(material.userData.elmVegetationUniforms.elmVegetationTime.value, 0.25);
});

test('registers Elm vegetation and its card palette on the shared planet runtime', () => {
    const feature = resolvePlanetFeature({ mainLanguage: ' Elm ' });
    const texture = new THREE_RUNTIME.Texture();
    const runtime = createPlanetFeatureRuntime({
        THREE: THREE_RUNTIME,
        planetTexture: texture,
        data: { mainLanguage: 'Elm', planetColor: '#3f9b55' },
        radius: 2
    });

    assert.equal(feature?.id, 'elm');
    assert.deepEqual(feature.cardTheme, {
        id: 'elm-meadow',
        accent: '#a8e0a4',
        atmosphere: '#315938',
        highlight: '#d4efc2',
        atmospherePosition: '28% 62%',
        highlightPosition: '76% 36%'
    });
    assert.equal(runtime.id, 'elm');
    assert.equal(runtime.material.map, texture);
    runtime.update(12_000);
    assert.equal(runtime.material.userData.elmVegetationUniforms.elmVegetationTime.value, 0.5);

    runtime.material.dispose();
    texture.dispose();
});
