export function isGoPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'go';
}

export function createGoPlanetWindMaterial(THREE, planetTexture) {
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: planetTexture,
        aoMap: planetTexture,
        aoMapIntensity: 0.65,
        roughness: 0.72,
        metalness: 0.16
    });
    const uniforms = {
        goWindTime: { value: 0 }
    };

    material.onBeforeCompile = (shader) => {
        shader.uniforms.goWindTime = uniforms.goWindTime;

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                '#include <common>\nvarying vec3 vGoWindPosition;\nvarying vec3 vGoWindViewNormal;\nvarying vec3 vGoWindViewDirection;'
            )
            .replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\nvGoWindPosition = position;\nvGoWindViewNormal = normalize(normalMatrix * normal);\nvGoWindViewDirection = normalize(-(modelViewMatrix * vec4(position, 1.0)).xyz);'
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
uniform float goWindTime;
varying vec3 vGoWindPosition;
varying vec3 vGoWindViewNormal;
varying vec3 vGoWindViewDirection;`
            )
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>
vec3 goMappedTexture = diffuseColor.rgb;
float goTextureRelief = dot(goMappedTexture, vec3(0.299, 0.587, 0.114));
vec3 goSurfacePosition = normalize(vGoWindPosition);

vec3 goWindAxis = normalize(vec3(0.28, 0.91, 0.31));
vec3 goWindBasisX = normalize(cross(goWindAxis, vec3(0.0, 0.0, 1.0)));
vec3 goWindBasisY = normalize(cross(goWindAxis, goWindBasisX));
float goLongitude = atan(
    dot(goSurfacePosition, goWindBasisY),
    dot(goSurfacePosition, goWindBasisX)
);
float goLatitude = dot(goSurfacePosition, goWindAxis);

float goTravel = goLongitude + goLatitude * 2.35 - goWindTime * 3.15;
float goPrimaryWave = sin(goTravel * 11.0 + goLatitude * 2.4) * 0.5 + 0.5;
float goSecondaryWave = sin(goTravel * 22.0 + goLatitude * 5.2 + 1.1) * 0.5 + 0.5;
float goPrimaryStreak = pow(smoothstep(0.62, 1.0, goPrimaryWave), 7.0);
float goFineStreak = pow(smoothstep(0.74, 1.0, goSecondaryWave), 10.0);

float goTailWave = sin(goTravel * 4.0 - goLatitude * 13.0 + 0.7) * 0.5 + 0.5;
float goTailGate = smoothstep(0.42, 0.7, goTailWave)
    * (1.0 - smoothstep(0.83, 0.98, goTailWave));
float goWindStreak = clamp(goPrimaryStreak * goTailGate + goFineStreak * goTailGate * 0.55, 0.0, 1.0);

float goRim = pow(1.0 - clamp(dot(vGoWindViewDirection, vGoWindViewNormal), 0.0, 1.0), 3.2);
float goRimGustWave = sin(goTravel * 7.0 + goLatitude * 8.0) * 0.5 + 0.5;
float goRimGust = pow(smoothstep(0.72, 1.0, goRimGustWave), 6.0) * goRim;

float goContrastedRelief = clamp((goTextureRelief - 0.5) * 1.55 + 0.5, 0.0, 1.0);
vec3 goDeepColor = vec3(0.0, 0.29, 0.42);
vec3 goBaseColor = vec3(0.0, 0.68, 0.85);
vec3 goWindColor = vec3(0.72, 0.95, 1.0);
vec3 goFlashColor = vec3(0.94, 1.0, 1.0);
vec3 goTerrainColor = mix(goDeepColor, goBaseColor, 0.38 + goContrastedRelief * 0.62);
goTerrainColor *= 0.72 + goContrastedRelief * 0.48;
vec3 goFlowColor = mix(goTerrainColor, goWindColor, goWindStreak * 0.78);
goFlowColor = mix(goFlowColor, goFlashColor, goRimGust * 0.72);
diffuseColor.rgb = mix(goMappedTexture, goFlowColor, 0.82);`
            )
            .replace(
                '#include <emissivemap_fragment>',
                '#include <emissivemap_fragment>\ntotalEmissiveRadiance += goWindColor * goWindStreak * 0.22;\ntotalEmissiveRadiance += goFlashColor * goRimGust * 0.62;'
            );
    };

    material.customProgramCacheKey = () => 'go-planet-oblique-gale-v1';
    material.userData.goWindUniforms = uniforms;
    material.userData.goWindStartMilliseconds = null;
    return material;
}

export function updateGoPlanetWind(material, nowMilliseconds) {
    const uniforms = material?.userData?.goWindUniforms;
    if (!uniforms) return;
    if (material.userData.goWindStartMilliseconds === null) {
        material.userData.goWindStartMilliseconds = nowMilliseconds;
    }
    uniforms.goWindTime.value = (
        nowMilliseconds - material.userData.goWindStartMilliseconds
    ) / 1000;
}
