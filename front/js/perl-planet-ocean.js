const PERL_OCEAN_CYCLE_SECONDS = 36;
const TAU = Math.PI * 2;

export function isPerlPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'perl';
}

export function createPerlPlanetOceanMaterial(THREE, planetTexture) {
    const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: planetTexture,
        aoMap: planetTexture,
        // Marsの凹凸はmapで見せ、AOとの二重適用による斑点化は避ける。
        aoMapIntensity: 0,
        // 海水は金属ではなく誘電体として扱い、光源に合う小さな反射だけを残す。
        roughness: 0.62,
        metalness: 0,
        ior: 1.333,
        clearcoat: 0.2,
        clearcoatRoughness: 0.18
    });
    const uniforms = {
        perlOceanTime: { value: 0 }
    };

    material.userData.perlOceanUniforms = uniforms;
    material.userData.perlOceanStartMilliseconds = null;
    material.onBeforeCompile = (shader) => {
        shader.uniforms.perlOceanTime = uniforms.perlOceanTime;
        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
varying vec3 vPerlOceanDirection;
varying vec3 vPerlOceanWaveTangentView;`
            )
            .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
vPerlOceanDirection = normalize(position);
vec3 perlOceanFlowDirection = normalize(vec3(0.82, 0.31, -0.47));
vec3 perlWaveTangent = perlOceanFlowDirection
    - vPerlOceanDirection * dot(perlOceanFlowDirection, vPerlOceanDirection);
vPerlOceanWaveTangentView = normalMatrix * perlWaveTangent;`
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
uniform float perlOceanTime;
varying vec3 vPerlOceanDirection;
varying vec3 vPerlOceanWaveTangentView;`
            )
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>
vec3 perlMarsTexture = diffuseColor.rgb;
float perlMarsLuminance = dot(perlMarsTexture, vec3(0.299, 0.587, 0.114));
float perlMarsRelief = clamp((perlMarsLuminance - 0.45) * 1.25 + 0.5, 0.0, 1.0);

// 地表の色帯は控えめにし、同じ広い流れを反射ハイライトの揺れに使う。
vec3 perlOceanFlowDirection = normalize(vec3(0.82, 0.31, -0.47));
float perlCurrentPhase = dot(
    normalize(vPerlOceanDirection),
    perlOceanFlowDirection
) * 3.6 - perlOceanTime * ${TAU.toFixed(8)};
float perlCurrent = 0.5 + 0.5 * sin(perlCurrentPhase);
vec3 perlDeepSea = vec3(0.006, 0.045, 0.10);
vec3 perlOpenSea = vec3(0.018, 0.20, 0.34);
vec3 perlSeaColor = mix(perlDeepSea, perlOpenSea, 0.31 + 0.24 * perlCurrent);

// 火星画像は水深図ではないため、クレーターを海底として誤読させない濃度に抑える。
vec3 perlSubmergedMars = perlMarsTexture * vec3(0.25, 0.37, 0.65);
perlSeaColor = mix(perlSeaColor, perlSubmergedMars, 0.12);
perlSeaColor *= 0.92 + perlMarsRelief * 0.16;
diffuseColor.rgb = perlSeaColor;`
            )
            .replace(
                '#include <clearcoat_normal_fragment_maps>',
                `#include <clearcoat_normal_fragment_maps>
// 単一の低周波の潮流だけで法線をわずかに傾け、PBRの反射光を静かに揺らす。
float perlWaveSlope = cos(perlCurrentPhase) * 0.006 * 3.6;
normal = normalize(normal - vPerlOceanWaveTangentView * perlWaveSlope);
#ifdef USE_CLEARCOAT
clearcoatNormal = normalize(clearcoatNormal - vPerlOceanWaveTangentView * perlWaveSlope);
#endif`
            );
    };
    material.customProgramCacheKey = () => 'perl-planet-ocean-v4-water-specular';
    return material;
}

export function updatePerlPlanetOcean(material, nowMilliseconds) {
    const uniforms = material?.userData?.perlOceanUniforms;
    if (!uniforms?.perlOceanTime || !Number.isFinite(nowMilliseconds)) return;

    if (material.userData.perlOceanStartMilliseconds === null) {
        material.userData.perlOceanStartMilliseconds = nowMilliseconds;
    }
    const elapsedSeconds = Math.max(
        0,
        (nowMilliseconds - material.userData.perlOceanStartMilliseconds) / 1000
    );
    uniforms.perlOceanTime.value = (
        elapsedSeconds % PERL_OCEAN_CYCLE_SECONDS
    ) / PERL_OCEAN_CYCLE_SECONDS;
}
