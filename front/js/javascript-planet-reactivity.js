const JAVASCRIPT_REACTION_CYCLE_SECONDS = 12;

export function isJavaScriptPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'javascript';
}

export function createJavaScriptPlanetMaterial(THREE, planetTexture, color) {
    const material = new THREE.MeshStandardMaterial({
        color,
        aoMap: planetTexture,
        aoMapIntensity: 1.5,
        roughness: 0.8,
        metalness: 0.2
    });
    const uniforms = {
        jsReactionTime: { value: 0 }
    };

    material.userData.jsReactionUniforms = uniforms;
    material.onBeforeCompile = (shader) => {
        shader.uniforms.jsReactionTime = uniforms.jsReactionTime;
        shader.vertexShader = shader.vertexShader
            .replace(
                'void main() {',
                `varying vec3 vJsReactionPosition;

                void main() {`
            )
            .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                vJsReactionPosition = normalize(position);`
            );
        shader.fragmentShader = shader.fragmentShader
            .replace(
                'void main() {',
                `uniform float jsReactionTime;
                varying vec3 vJsReactionPosition;

                void main() {`
            )
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>
                float jsPhase = jsReactionTime * 6.28318530718;
                vec3 jsPosition = normalize(vJsReactionPosition);
                float jsFlex = sin(jsPosition.y * 7.0 + jsPhase)
                    * cos(jsPosition.z * 5.0 - jsPhase * 2.0) * 0.16;
                float jsFieldA = dot(jsPosition, normalize(vec3(0.7, 0.42, 0.57))) + jsFlex;
                float jsFieldB = dot(jsPosition, normalize(vec3(-0.48, 0.76, 0.43))) - jsFlex * 0.7;
                float jsFieldC = dot(jsPosition, normalize(vec3(0.24, -0.63, 0.74))) + jsFlex * 0.45;
                float jsPulseA = pow(max(sin(jsPhase), 0.0), 3.0);
                float jsPulseB = pow(max(sin(jsPhase - 2.09439510239), 0.0), 3.0);
                float jsPulseC = pow(max(sin(jsPhase - 4.18879020479), 0.0), 3.0);
                float jsRegionA = (1.0 - smoothstep(0.12, 0.31, abs(jsFieldA - 0.28))) * jsPulseA;
                float jsRegionB = (1.0 - smoothstep(0.1, 0.28, abs(jsFieldB - 0.06))) * jsPulseB;
                float jsRegionC = (1.0 - smoothstep(0.11, 0.3, abs(jsFieldC + 0.18))) * jsPulseC;
                float jsReaction = clamp(jsRegionA + jsRegionB + jsRegionC, 0.0, 1.0);
                float jsUncertainty = pow(max(sin(jsPhase * 3.0 + jsPosition.x * 11.0), 0.0), 8.0)
                    * jsReaction * 0.18;
                float jsIncidentWindow = pow(max(sin(jsPhase - 0.35), 0.0), 4.0);
                float jsPrimaryBranch = (
                    1.0 - smoothstep(
                        0.075,
                        0.22,
                        abs(jsFieldA + jsFieldC * 0.28 - 0.08)
                    )
                ) * smoothstep(-0.35, 0.28, jsFieldB) * jsIncidentWindow;
                float jsFailedBranchShape = (
                    1.0 - smoothstep(
                        0.07,
                        0.2,
                        abs(jsFieldA - jsFieldC * 0.34 - 0.02)
                    )
                ) * smoothstep(-0.28, 0.34, -jsFieldB) * jsIncidentWindow;
                float jsFailedBranchLife = smoothstep(
                    -0.18,
                    0.48,
                    cos(jsPhase - 0.72)
                );
                float jsFailedBranch = jsFailedBranchShape * jsFailedBranchLife;
                float jsAbortFlash = pow(
                    max(sin(jsPhase * 4.0 + jsPosition.z * 5.0), 0.0),
                    14.0
                ) * jsFailedBranch;
                float jsCollapsedBranch = jsFailedBranchShape
                    * (1.0 - jsFailedBranchLife);
                float jsBrightness = 1.0
                    + jsReaction * 0.34
                    + jsUncertainty
                    + jsPrimaryBranch * 0.34
                    + jsFailedBranch * 0.58
                    + jsAbortFlash * 0.46
                    - jsCollapsedBranch * 0.48;
                diffuseColor.rgb *= max(jsBrightness, 0.52);`
            );
    };
    material.customProgramCacheKey = () => 'javascript-planet-flexible-reactivity-v6';
    return material;
}

export function updateJavaScriptPlanetReactivity(material, nowMilliseconds) {
    const uniforms = material?.userData?.jsReactionUniforms;
    if (!uniforms) return;
    uniforms.jsReactionTime.value = (
        nowMilliseconds / 1000 % JAVASCRIPT_REACTION_CYCLE_SECONDS
    ) / JAVASCRIPT_REACTION_CYCLE_SECONDS;
}
