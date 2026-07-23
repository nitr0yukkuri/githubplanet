const HTML_LAYER_CYCLE_SECONDS = 18;

export function isHtmlPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'html';
}

export function createHtmlPlanetMaterial(THREE, planetTexture, color) {
    const material = new THREE.MeshStandardMaterial({
        color,
        aoMap: planetTexture,
        aoMapIntensity: 1.5,
        roughness: 0.8,
        metalness: 0.2,
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.025
    });
    const uniforms = {
        htmlLayerTime: { value: 0 }
    };

    material.userData.htmlLayerUniforms = uniforms;
    material.onBeforeCompile = (shader) => {
        shader.uniforms.htmlLayerTime = uniforms.htmlLayerTime;
        shader.vertexShader = shader.vertexShader
            .replace(
                'void main() {',
                `varying vec3 vHtmlStructurePosition;

                void main() {`
            )
            .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                vHtmlStructurePosition = normalize(position);`
            );
        shader.fragmentShader = shader.fragmentShader
            .replace(
                'void main() {',
                `uniform float htmlLayerTime;
                varying vec3 vHtmlStructurePosition;

                float htmlHash(float value) {
                    return fract(sin(value * 91.731) * 43758.5453);
                }

                float htmlWrappedDistance(float a, float b) {
                    return abs(fract(a - b + 0.5) - 0.5);
                }

                float htmlSegmentPath(float longitude, float latitude, float pathIndex) {
                    float pathProgress = clamp(latitude + 0.5, 0.0, 0.9999);
                    float segmentPosition = pathProgress * 5.0;
                    float segmentIndex = floor(segmentPosition);
                    float segmentMix = fract(segmentPosition);
                    float baseLongitude = fract(pathIndex * 0.61803398875 + 0.08);
                    float previousBend = (htmlHash(pathIndex * 17.0 + segmentIndex) - 0.5) * 0.12;
                    float nextBend = (htmlHash(pathIndex * 17.0 + segmentIndex + 1.0) - 0.5) * 0.12;
                    float pathLongitude = fract(
                        baseLongitude + mix(previousBend, nextBend, segmentMix)
                    );
                    return htmlWrappedDistance(longitude, pathLongitude);
                }

                void main() {`
            )
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>
                float htmlPhase = htmlLayerTime * 6.28318530718;
                vec3 htmlPosition = normalize(vHtmlStructurePosition);
                float htmlLongitude = atan(htmlPosition.z, htmlPosition.x)
                    / 6.28318530718 + 0.5;
                float htmlLatitude = asin(clamp(htmlPosition.y, -1.0, 1.0))
                    / 3.14159265359;
                float htmlPolarFade = smoothstep(0.015, 0.1, 0.5 - abs(htmlLatitude));

                float htmlGroove = 0.0;
                float htmlAmberEdge = 0.0;
                float htmlNode = 0.0;
                float htmlNodeBevel = 0.0;
                for (int htmlPath = 0; htmlPath < 18; htmlPath++) {
                    float htmlPathIndex = float(htmlPath);
                    float htmlPathDistance = htmlSegmentPath(
                        htmlLongitude,
                        htmlLatitude,
                        htmlPathIndex
                    );
                    float htmlPathGroove = 1.0 - smoothstep(
                        0.0012,
                        0.0046,
                        htmlPathDistance
                    );
                    float htmlReflectionDistance = abs(htmlPathDistance - 0.0038);
                    float htmlPathReflection = 1.0 - smoothstep(
                        0.0007,
                        0.0019,
                        htmlReflectionDistance
                    );

                    float htmlBranchStart = -0.24 + htmlHash(htmlPathIndex * 7.0) * 0.42;
                    float htmlBranchProgress = clamp(
                        (htmlLatitude - htmlBranchStart) / 0.23,
                        0.0,
                        1.0
                    );
                    float htmlBranchEnabled = step(0.46, htmlHash(htmlPathIndex * 13.0));
                    float htmlBranchSide = step(0.5, htmlHash(htmlPathIndex * 23.0)) * 2.0 - 1.0;
                    float htmlBranchOffset = htmlBranchSide * htmlBranchProgress * 0.055;
                    float htmlBranchWindow = smoothstep(
                        htmlBranchStart,
                        htmlBranchStart + 0.025,
                        htmlLatitude
                    ) * (1.0 - smoothstep(
                        htmlBranchStart + 0.2,
                        htmlBranchStart + 0.23,
                        htmlLatitude
                    ));
                    float htmlBranchDistance = htmlSegmentPath(
                        fract(htmlLongitude - htmlBranchOffset),
                        htmlLatitude,
                        htmlPathIndex
                    );
                    float htmlBranchGroove = (1.0 - smoothstep(
                        0.001,
                        0.0038,
                        htmlBranchDistance
                    )) * htmlBranchWindow * htmlBranchEnabled;

                    float htmlNodeGrid = (htmlLatitude + 0.5) * 7.0
                        + htmlHash(htmlPathIndex * 31.0);
                    float htmlNodeRow = floor(htmlNodeGrid);
                    float htmlNodeCenter = (htmlNodeRow
                        - htmlHash(htmlPathIndex * 31.0) + 0.5) / 7.0 - 0.5;
                    float htmlNodeVisible = step(
                        0.34,
                        htmlHash(htmlPathIndex * 41.0 + htmlNodeRow)
                    );
                    float htmlNodeX = 1.0 - smoothstep(
                        0.0035,
                        0.007,
                        htmlPathDistance
                    );
                    float htmlNodeY = 1.0 - smoothstep(
                        0.006,
                        0.012,
                        abs(htmlLatitude - htmlNodeCenter)
                    );
                    float htmlNodeShape = htmlNodeX * htmlNodeY * htmlNodeVisible;
                    float htmlNodeInnerX = 1.0 - smoothstep(
                        0.0018,
                        0.0042,
                        htmlPathDistance
                    );
                    float htmlNodeInnerY = 1.0 - smoothstep(
                        0.0035,
                        0.0075,
                        abs(htmlLatitude - htmlNodeCenter)
                    );
                    float htmlNodeInner = htmlNodeInnerX * htmlNodeInnerY * htmlNodeVisible;

                    float htmlTravel = 0.72 + pow(max(sin(
                        htmlPhase - htmlLatitude * 6.28318530718
                            - htmlPathIndex * 0.72
                    ), 0.0), 6.0) * 0.28;
                    htmlGroove = max(
                        htmlGroove,
                        max(htmlPathGroove, htmlBranchGroove * 0.88)
                    );
                    htmlAmberEdge = max(
                        htmlAmberEdge,
                        htmlPathReflection * htmlTravel
                    );
                    htmlNode = max(htmlNode, htmlNodeShape);
                    htmlNodeBevel = max(
                        htmlNodeBevel,
                        max(htmlNodeShape - htmlNodeInner, 0.0)
                    );
                }

                htmlGroove *= htmlPolarFade;
                htmlAmberEdge *= htmlPolarFade;
                htmlNode *= htmlPolarFade;
                htmlNodeBevel *= htmlPolarFade;
                vec3 htmlTerrain = diffuseColor.rgb;
                vec3 htmlGrooveColor = htmlTerrain * vec3(0.42, 0.31, 0.27);
                vec3 htmlNodeColor = htmlTerrain * vec3(0.58, 0.43, 0.36);
                vec3 htmlAmberColor = vec3(0.98, 0.48, 0.16);
                diffuseColor.rgb = mix(
                    diffuseColor.rgb,
                    htmlGrooveColor,
                    htmlGroove * 0.62
                );
                diffuseColor.rgb = mix(
                    diffuseColor.rgb,
                    htmlNodeColor,
                    htmlNode * 0.52
                );
                diffuseColor.rgb = mix(
                    diffuseColor.rgb,
                    htmlAmberColor,
                    min(htmlAmberEdge * 0.15 + htmlNodeBevel * 0.12, 0.2)
                );`
            );
    };
    material.customProgramCacheKey = () => 'html-planet-engraved-dom-network-v8';
    return material;
}

export function updateHtmlPlanetLayers(material, nowMilliseconds) {
    const uniforms = material?.userData?.htmlLayerUniforms;
    if (!uniforms) return;
    uniforms.htmlLayerTime.value = (
        nowMilliseconds / 1000 % HTML_LAYER_CYCLE_SECONDS
    ) / HTML_LAYER_CYCLE_SECONDS;
}
