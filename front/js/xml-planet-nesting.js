const XML_NESTING_CYCLE_SECONDS = 18;

export function isXmlPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'xml';
}

export function createXmlPlanetMaterial(THREE, planetTexture) {
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: planetTexture,
        aoMap: planetTexture,
        aoMapIntensity: 1.0,
        roughness: 0.84,
        metalness: 0.1
    });
    const uniforms = { xmlNestingTime: { value: 0 } };

    material.onBeforeCompile = (shader) => {
        shader.uniforms.xmlNestingTime = uniforms.xmlNestingTime;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vXmlPosition;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvXmlPosition = position;');
        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
uniform float xmlNestingTime;
varying vec3 vXmlPosition;`
            )
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>
vec3 xmlMappedTexture = diffuseColor.rgb;
float xmlTextureRelief = dot(xmlMappedTexture, vec3(0.299, 0.587, 0.114));
vec3 xmlSurface = normalize(vXmlPosition);
float xmlPhase = xmlNestingTime * 6.28318530718;
float xmlLongitude = atan(xmlSurface.x, xmlSurface.z);
float xmlLatitude = asin(clamp(xmlSurface.y, -1.0, 1.0));

// Nested structure is kept inside the visible terrain as quiet, partial shells.
vec2 xmlPoint = vec2((xmlLongitude + 0.62) * 0.56, (xmlLatitude - 0.06) * 1.12);
float xmlRadius = length(xmlPoint);
float xmlShellA = 1.0 - smoothstep(0.018, 0.058, abs(xmlRadius - 0.22));
float xmlShellB = 1.0 - smoothstep(0.016, 0.052, abs(xmlRadius - 0.39));
float xmlShellC = 1.0 - smoothstep(0.014, 0.048, abs(xmlRadius - 0.56));
float xmlOpening = smoothstep(-0.1, 0.35, sin(xmlLongitude * 1.3 + 0.4));
float xmlNested = (xmlShellA * 0.56 + xmlShellB * 0.42 + xmlShellC * 0.3) * xmlOpening;
float xmlBranch = 1.0 - smoothstep(
    0.018,
    0.065,
    abs(xmlLatitude - 0.06 - sin(xmlLongitude * 2.0 + sin(xmlPhase) * 0.12) * 0.13)
);
float xmlRelief = clamp((xmlTextureRelief - 0.47) * 1.7 + 0.5, 0.0, 1.0);
vec3 xmlDeep = vec3(0.025, 0.09, 0.13);
vec3 xmlBase = vec3(0.16, 0.38, 0.52);
vec3 xmlEdge = vec3(0.47, 0.76, 0.82);
vec3 xmlTerrain = mix(xmlDeep, xmlBase, 0.36 + xmlRelief * 0.64);
xmlTerrain = mix(xmlTerrain, xmlDeep * 0.56, xmlNested * 0.24);
// 静かな入れ子を保ちつつ、時間だけ進んで画面が変わらない状態を避ける。
float xmlBranchResponse = 0.5 + 0.5 * cos(xmlPhase - xmlLongitude * 2.0);
xmlTerrain = mix(xmlTerrain, xmlEdge, xmlNested * (0.08 + xmlBranchResponse * 0.18 + xmlBranch * 0.03));
xmlTerrain *= 0.8 + xmlRelief * 0.42;
diffuseColor.rgb = mix(xmlMappedTexture, xmlTerrain, 0.86);`
            );
    };
    material.customProgramCacheKey = () => 'xml-planet-nested-surface-v4-readable-response';
    material.userData.xmlNestingUniforms = uniforms;
    return material;
}

export function updateXmlPlanetNesting(material, nowMilliseconds) {
    const uniforms = material?.userData?.xmlNestingUniforms;
    if (!uniforms) return;
    uniforms.xmlNestingTime.value = (
        nowMilliseconds / 1000 % XML_NESTING_CYCLE_SECONDS
    ) / XML_NESTING_CYCLE_SECONDS;
}

