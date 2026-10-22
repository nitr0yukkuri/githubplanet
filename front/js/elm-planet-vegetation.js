const ELM_VEGETATION_CYCLE_SECONDS = 24;
const TAU = Math.PI * 2;

export function isElmPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'elm';
}

export function createElmPlanetMaterial(
    THREE,
    planetTexture,
    planetColor = '#3f9b55'
) {
    const baseColor = new THREE.Color(planetColor);
    const material = new THREE.MeshStandardMaterial({
        color: planetColor,
        map: planetTexture,
        aoMap: planetTexture,
        aoMapIntensity: 0.42,
        roughness: 0.94,
        metalness: 0
    });
    material.extensions = { shaderTextureLOD: true };
    const uniforms = {
        elmVegetationTime: { value: 0 },
        elmInverseDiffuse: {
            value: new THREE.Vector3(
                1 / Math.max(baseColor.r, 0.001),
                1 / Math.max(baseColor.g, 0.001),
                1 / Math.max(baseColor.b, 0.001)
            )
        }
    };

    material.onBeforeCompile = (shader) => {
        shader.uniforms.elmVegetationTime = uniforms.elmVegetationTime;
        shader.uniforms.elmInverseDiffuse = uniforms.elmInverseDiffuse;
        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                '#include <common>\nvarying vec3 vElmSurfacePosition;'
            )
            .replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\nvElmSurfacePosition = normalize(position);'
            );
        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
uniform float elmVegetationTime;
uniform vec3 elmInverseDiffuse;
varying vec3 vElmSurfacePosition;

float elmVegetationHash(vec3 cell) {
    return fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float elmVegetationNoise(vec3 point) {
    vec3 cell = floor(point);
    vec3 local = fract(point);
    local = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);

    float c000 = elmVegetationHash(cell);
    float c100 = elmVegetationHash(cell + vec3(1.0, 0.0, 0.0));
    float c010 = elmVegetationHash(cell + vec3(0.0, 1.0, 0.0));
    float c110 = elmVegetationHash(cell + vec3(1.0, 1.0, 0.0));
    float c001 = elmVegetationHash(cell + vec3(0.0, 0.0, 1.0));
    float c101 = elmVegetationHash(cell + vec3(1.0, 0.0, 1.0));
    float c011 = elmVegetationHash(cell + vec3(0.0, 1.0, 1.0));
    float c111 = elmVegetationHash(cell + vec3(1.0, 1.0, 1.0));

    float lower = mix(
        mix(c000, c100, local.x),
        mix(c010, c110, local.x),
        local.y
    );
    float upper = mix(
        mix(c001, c101, local.x),
        mix(c011, c111, local.x),
        local.y
    );
    return mix(lower, upper, local.z);
}`
            )
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>
vec3 elmMappedTexture = diffuseColor.rgb;
vec3 elmTerrainTexture = elmMappedTexture * elmInverseDiffuse;
float elmAlbedoLuminance = dot(elmTerrainTexture, vec3(0.299, 0.587, 0.114));
vec3 elmSurface = normalize(vElmSurfacePosition);
float elmPhase = elmVegetationTime * ${TAU.toFixed(8)};

// 生息域は火星画像の広い明暗模様に沿わせる。標高ではなく、地表との視覚的な連続性に使う。
// 固定mipで細かなクレーターを分布判定から除き、ホームと小さなカードでも同じ輪郭を保つ。
vec3 elmRegionalTexture = elmTerrainTexture;
#ifdef USE_MAP
    #if __VERSION__ >= 300 || defined(GL_EXT_shader_texture_lod)
        elmRegionalTexture = texture2DLodEXT(map, vMapUv, 4.5).rgb;
    #else
        elmRegionalTexture = texture2D(map, vMapUv, 3.0).rgb;
    #endif
#endif
float elmRegionalLuminance = dot(elmRegionalTexture, vec3(0.299, 0.587, 0.114));
float elmRegionalField = elmVegetationNoise(elmSurface * 1.9 + vec3(2.4, 7.1, 1.9));
float elmDryField = elmVegetationNoise(elmSurface * 2.8 + vec3(11.8, 3.1, 4.7));
float elmHabitatTone = elmRegionalLuminance
    + (elmRegionalField - 0.5) * 0.08
    + (elmAlbedoLuminance - elmRegionalLuminance) * 0.25;
float elmForestMass = 1.0 - smoothstep(0.36, 0.51, elmHabitatTone);

// 草地を下地にし、岩は明るい地質と乾燥域が重なる場所だけ露出させる。丸い茶色の斑点を作らない。
float elmRockExposure = smoothstep(0.45, 0.62, elmRegionalLuminance)
    * smoothstep(0.4, 0.68, elmDryField)
    * (1.0 - elmForestMass * 0.94);
float elmMeadowMass = (1.0 - elmForestMass) * (1.0 - elmRockExposure);

// 元のUVテクスチャの局所的な明暗を残し、最暗部だけを持ち上げる。
float elmTerrainDetail = clamp(elmAlbedoLuminance / 0.44, 0.42, 1.5);
float elmTerrainShade = mix(1.0, elmTerrainDetail, 0.85);
vec3 elmMarsSurface = mix(
    vec3(elmAlbedoLuminance) * vec3(0.36, 0.29, 0.22),
    elmTerrainTexture * vec3(0.33, 0.39, 0.45),
    0.24
);
vec3 elmMeadowPalette = mix(
    vec3(0.17, 0.32, 0.23),
    vec3(0.27, 0.43, 0.32),
    smoothstep(0.22, 0.8, elmDryField)
);
vec3 elmForestPalette = mix(
    vec3(0.04, 0.14, 0.075),
    vec3(0.10, 0.26, 0.135),
    elmRegionalField
);
vec3 elmMeadowSurface = elmMeadowPalette * elmTerrainShade;
vec3 elmForestSurface = elmForestPalette * elmTerrainShade;
vec3 elmOpenSurface = mix(elmMeadowSurface, elmMarsSurface, elmRockExposure);
diffuseColor.rgb = mix(elmOpenSurface, elmForestSurface, elmForestMass);

// 風は24秒周期で明暗を1%未満だけ変え、生息域そのものは移動させない。
float elmWind = sin(dot(elmSurface, normalize(vec3(0.82, 0.31, -0.47))) * 4.0 - elmPhase);
diffuseColor.rgb *= 1.0 + elmWind * (elmForestMass * 0.004 + elmMeadowMass * 0.007);
float elmSurfaceHeight = elmAlbedoLuminance * 0.6;`
            );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
// 森のマットさは保ち、草地だけが宇宙の光を柔らかく拾うようにする。岩や地形は磨かない。
roughnessFactor = mix(0.94, 0.97, elmForestMass) - elmMeadowMass * 0.06;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
// 元画像の細かな起伏を弱い法線変化として残し、広い植生面も滑らかな塗装に見せない。
vec3 elmSigmaX = normalize(dFdx(-vViewPosition));
vec3 elmSigmaY = normalize(dFdy(-vViewPosition));
vec3 elmNormalR1 = cross(elmSigmaY, normal);
vec3 elmNormalR2 = cross(normal, elmSigmaX);
float elmNormalDeterminant = dot(elmSigmaX, elmNormalR1);
vec3 elmNormalGradient = sign(elmNormalDeterminant)
    * (dFdx(elmSurfaceHeight) * elmNormalR1 + dFdy(elmSurfaceHeight) * elmNormalR2);
normal = normalize(abs(elmNormalDeterminant) * normal - elmNormalGradient);`
        );
    };
    material.customProgramCacheKey = () => 'elm-planet-terrain-habitats-v17-sage-light';
    material.userData.elmVegetationUniforms = uniforms;
    return material;
}

export function updateElmPlanetVegetation(material, nowMilliseconds) {
    const uniforms = material?.userData?.elmVegetationUniforms;
    if (!uniforms?.elmVegetationTime) return;

    uniforms.elmVegetationTime.value = (
        nowMilliseconds / 1000 % ELM_VEGETATION_CYCLE_SECONDS
    ) / ELM_VEGETATION_CYCLE_SECONDS;
}
