const CSS_FLOW_DURATION_SECONDS = 24;

export function isCssPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'css';
}

export function createCssPlanetFlowMaterial(THREE, planetTexture) {
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: planetTexture,
        aoMap: planetTexture,
        aoMapIntensity: 0.45,
        roughness: 0.8,
        metalness: 0.2
    });
    const uniforms = {
        cssFlowTime: { value: 0 }
    };

    material.onBeforeCompile = (shader) => {
        shader.uniforms.cssFlowTime = uniforms.cssFlowTime;

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                '#include <common>\nvarying vec3 vCssFlowPosition;'
            )
            .replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\nvCssFlowPosition = position;'
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
uniform float cssFlowTime;
varying vec3 vCssFlowPosition;

vec3 cssHsvToRgb(vec3 color) {
    vec3 offsets = vec3(0.0, 0.6666667, 0.3333333);
    vec3 channels = abs(fract(color.xxx + offsets) * 6.0 - 3.0);
    return color.z * mix(vec3(1.0), clamp(channels - 1.0, 0.0, 1.0), color.y);
}`
            )
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>
vec3 mappedTexture = diffuseColor.rgb;
float textureRelief = dot(mappedTexture, vec3(0.299, 0.587, 0.114));

float loop = cssFlowTime * 6.28318530718;
vec3 flowPosition = normalize(vCssFlowPosition);
vec3 flowDirection = normalize(vec3(0.88, 0.34, 0.32));
vec3 lateralDirection = normalize(vec3(-0.24, 0.93, -0.28));
float forwardPosition = dot(flowPosition, flowDirection);
float lateralPosition = dot(flowPosition, lateralDirection);

float gentleBend = sin(lateralPosition * 2.25 + loop) * 0.2;
float directionalPhase = forwardPosition * 4.4 + gentleBend - loop;
float broadBand = sin(directionalPhase) * 0.5 + 0.5;
float trailingBand = sin(directionalPhase - 1.18) * 0.5 + 0.5;
float gradientBand = smoothstep(0.04, 0.96, broadBand);
float softHighlight = pow(smoothstep(0.18, 0.92, trailingBand), 2.4);

float directionalHuePhase = forwardPosition * 1.5 + gentleBend - loop;
float flowingHue = fract(0.94 - directionalHuePhase / 6.28318530718);
float flowingSaturation = mix(0.72, 0.76, gradientBand);
flowingSaturation = mix(flowingSaturation, 0.66, softHighlight * 0.42);
float flowingBrightness = mix(0.88, 1.02, gradientBand);
flowingBrightness = mix(flowingBrightness, 1.08, softHighlight * 0.42);
vec3 flowingColor = cssHsvToRgb(vec3(flowingHue, flowingSaturation, flowingBrightness));

float contrastedRelief = clamp((textureRelief - 0.5) * 1.6 + 0.5, 0.0, 1.0);
vec3 colorizedTexture = flowingColor * (0.4 + contrastedRelief * 1.1);
diffuseColor.rgb = mix(mappedTexture, colorizedTexture, 0.8);`
            )
            .replace(
                '#include <emissivemap_fragment>',
                '#include <emissivemap_fragment>\ntotalEmissiveRadiance += flowingColor * 0.08;'
            );
    };
    material.customProgramCacheKey = () => 'css-planet-texture-flow-v3-one-way-hue';
    material.userData.cssFlowUniforms = uniforms;

    return material;
}

export function updateCssPlanetFlow(material, nowMilliseconds) {
    const uniforms = material?.userData?.cssFlowUniforms;
    if (!uniforms) return;

    uniforms.cssFlowTime.value = (nowMilliseconds / 1000 % CSS_FLOW_DURATION_SECONDS) / CSS_FLOW_DURATION_SECONDS;
}
