const INITIAL_GO_WIND_PHASE_SECONDS = 0.65;

export function isGoPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'go';
}

export function calculateGoWindSpeedFactor(rotationSpeed, baseRotationSpeed = 0.001) {
    const safeBaseSpeed = Math.max(Number(baseRotationSpeed) || 0, Number.EPSILON);
    const rotationRatio = Math.max(1, (Number(rotationSpeed) || 0) / safeBaseSpeed);
    return Math.min(2.5, 1 + Math.sqrt(rotationRatio - 1) * 0.5);
}

export function createGoPlanetWindMaterial(THREE, planetTexture, flowDirection = 1) {
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: planetTexture,
        aoMap: planetTexture,
        aoMapIntensity: 0.65,
        roughness: 0.72,
        metalness: 0.16
    });
    const uniforms = {
        goWindTime: { value: INITIAL_GO_WIND_PHASE_SECONDS },
        goWindDirection: { value: flowDirection < 0 ? -1 : 1 }
    };

    material.onBeforeCompile = (shader) => {
        shader.uniforms.goWindTime = uniforms.goWindTime;
        shader.uniforms.goWindDirection = uniforms.goWindDirection;

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
uniform float goWindDirection;
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

float goTravel = goLongitude + goLatitude * 2.35 - goWindTime * 3.15 * goWindDirection;
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
vec3 goFlowColor = mix(goTerrainColor, goWindColor, goWindStreak * 0.035);
goFlowColor = mix(goFlowColor, goFlashColor, goRimGust * 0.04);
diffuseColor.rgb = mix(goMappedTexture, goFlowColor, 0.82);`
            )
            .replace(
                '#include <emissivemap_fragment>',
                '#include <emissivemap_fragment>\ntotalEmissiveRadiance += goWindColor * goWindStreak * 0.008;\ntotalEmissiveRadiance += goFlashColor * goRimGust * 0.028;'
            );
    };

    material.customProgramCacheKey = () => 'go-planet-oblique-gale-v2';
    material.userData.goWindUniforms = uniforms;
    material.userData.goWindLastMilliseconds = null;
    return material;
}

export function createGoPlanetAtmosphere(THREE, radius, flowDirection = 1) {
    const atmosphere = new THREE.Group();
    const uniforms = {
        goAtmosphereTime: { value: INITIAL_GO_WIND_PHASE_SECONDS },
        goWindDirection: { value: flowDirection < 0 ? -1 : 1 }
    };

    const shellMaterial = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        vertexShader: `
            varying vec3 vGoAtmosphereNormal;
            varying vec3 vGoAtmosphereViewDirection;
            varying vec3 vGoAtmospherePosition;

            void main() {
                vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                vGoAtmosphereNormal = normalize(normalMatrix * normal);
                vGoAtmosphereViewDirection = normalize(-viewPosition.xyz);
                vGoAtmospherePosition = normalize(position);
                gl_Position = projectionMatrix * viewPosition;
            }
        `,
        fragmentShader: `
            uniform float goAtmosphereTime;
            uniform float goWindDirection;
            varying vec3 vGoAtmosphereNormal;
            varying vec3 vGoAtmosphereViewDirection;
            varying vec3 vGoAtmospherePosition;

            void main() {
                vec3 windAxis = normalize(vec3(0.28, 0.91, 0.31));
                vec3 windBasisX = normalize(cross(windAxis, vec3(0.0, 0.0, 1.0)));
                vec3 windBasisY = normalize(cross(windAxis, windBasisX));
                float longitude = atan(
                    dot(vGoAtmospherePosition, windBasisY),
                    dot(vGoAtmospherePosition, windBasisX)
                );
                float latitude = dot(vGoAtmospherePosition, windAxis);
                float travel = longitude + latitude * 2.35
                    - goAtmosphereTime * 3.15 * goWindDirection;
                float streakWave = sin(travel * 3.0 + latitude * 2.0) * 0.5 + 0.5;
                float streak = smoothstep(0.28, 0.88, streakWave);
                float latitudeFade = 1.0 - smoothstep(0.42, 0.96, abs(latitude));
                float rim = pow(1.0 - clamp(
                    dot(vGoAtmosphereViewDirection, vGoAtmosphereNormal),
                    0.0,
                    1.0
                ), 2.1);
                float gust = streak * latitudeFade;
                vec3 color = mix(vec3(0.0, 0.42, 0.62), vec3(0.18, 0.72, 0.84), gust);
                float alpha = rim * (0.045 + gust * 0.3);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
    const shell = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.1, 48, 48),
        shellMaterial
    );
    shell.renderOrder = 2;
    atmosphere.add(shell);

    [
        { radiusScale: 1.14, opacity: 0.17, phase: 0.0 },
        { radiusScale: 1.2, opacity: 0.1, phase: 1.8 }
    ].forEach(({ radiusScale, opacity, phase }) => {
        const wakeMaterial = new THREE.ShaderMaterial({
            uniforms: {
                goAtmosphereTime: uniforms.goAtmosphereTime,
                goWindDirection: uniforms.goWindDirection,
                goWakeOpacity: { value: opacity },
                goWakePhase: { value: phase }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            vertexShader: `
                varying vec3 vGoWakeNormal;
                varying vec3 vGoWakeViewDirection;
                varying vec3 vGoWakePosition;

                void main() {
                    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                    vGoWakeNormal = normalize(normalMatrix * normal);
                    vGoWakeViewDirection = normalize(-viewPosition.xyz);
                    vGoWakePosition = normalize(position);
                    gl_Position = projectionMatrix * viewPosition;
                }
            `,
            fragmentShader: `
                uniform float goAtmosphereTime;
                uniform float goWindDirection;
                uniform float goWakeOpacity;
                uniform float goWakePhase;
                varying vec3 vGoWakeNormal;
                varying vec3 vGoWakeViewDirection;
                varying vec3 vGoWakePosition;

                void main() {
                    vec3 windAxis = normalize(vec3(0.28, 0.91, 0.31));
                    vec3 windBasisX = normalize(cross(windAxis, vec3(0.0, 0.0, 1.0)));
                    vec3 windBasisY = normalize(cross(windAxis, windBasisX));
                    float longitude = atan(
                        dot(vGoWakePosition, windBasisY),
                        dot(vGoWakePosition, windBasisX)
                    );
                    float latitude = dot(vGoWakePosition, windAxis);
                    float travel = longitude + latitude * 2.0
                        - goAtmosphereTime * 1.35 * goWindDirection + goWakePhase;
                    float broadBand = sin(travel * 2.0) * 0.5 + 0.5;
                    broadBand = smoothstep(0.18, 0.86, broadBand);
                    float latitudeFade = 1.0 - smoothstep(0.38, 0.98, abs(latitude));
                    float rim = pow(1.0 - clamp(
                        dot(vGoWakeViewDirection, vGoWakeNormal),
                        0.0,
                        1.0
                    ), 1.7);
                    float alpha = rim * latitudeFade * (0.25 + broadBand * 0.75) * goWakeOpacity;
                    vec3 color = mix(vec3(0.0, 0.38, 0.55), vec3(0.12, 0.65, 0.76), broadBand);
                    gl_FragColor = vec4(color, alpha);
                }
            `
        });
        const wake = new THREE.Mesh(
            new THREE.SphereGeometry(radius * radiusScale, 48, 48),
            wakeMaterial
        );
        wake.renderOrder = 3;
        atmosphere.add(wake);
    });

    atmosphere.userData.goAtmosphereUniforms = uniforms;
    atmosphere.userData.goAtmosphereLastMilliseconds = null;
    return atmosphere;
}

export function updateGoPlanetAtmosphere(atmosphere, nowMilliseconds, speedFactor = 1) {
    const uniforms = atmosphere?.userData?.goAtmosphereUniforms;
    if (!uniforms) return;
    const lastMilliseconds = atmosphere.userData.goAtmosphereLastMilliseconds;
    atmosphere.userData.goAtmosphereLastMilliseconds = nowMilliseconds;
    if (lastMilliseconds === null) {
        return;
    }
    const elapsedSeconds = Math.max(0, nowMilliseconds - lastMilliseconds) / 1000;
    uniforms.goAtmosphereTime.value += elapsedSeconds * Math.max(0, speedFactor);
}

export function updateGoPlanetWind(material, nowMilliseconds, speedFactor = 1) {
    const uniforms = material?.userData?.goWindUniforms;
    if (!uniforms) return;
    const lastMilliseconds = material.userData.goWindLastMilliseconds;
    material.userData.goWindLastMilliseconds = nowMilliseconds;
    if (lastMilliseconds === null) {
        return;
    }
    const elapsedSeconds = Math.max(0, nowMilliseconds - lastMilliseconds) / 1000;
    uniforms.goWindTime.value += elapsedSeconds * Math.max(0, speedFactor);
}
