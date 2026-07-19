export function isGoPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'go';
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
        goWindTime: { value: 0 },
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
vec3 goFlowColor = mix(goTerrainColor, goWindColor, goWindStreak * 0.07);
goFlowColor = mix(goFlowColor, goFlashColor, goRimGust * 0.08);
diffuseColor.rgb = mix(goMappedTexture, goFlowColor, 0.82);`
            )
            .replace(
                '#include <emissivemap_fragment>',
                '#include <emissivemap_fragment>\ntotalEmissiveRadiance += goWindColor * goWindStreak * 0.018;\ntotalEmissiveRadiance += goFlashColor * goRimGust * 0.06;'
            );
    };

    material.customProgramCacheKey = () => 'go-planet-oblique-gale-v1';
    material.userData.goWindUniforms = uniforms;
    material.userData.goWindStartMilliseconds = null;
    return material;
}

export function createGoPlanetAtmosphere(THREE, radius, flowDirection = 1) {
    const atmosphere = new THREE.Group();
    const uniforms = {
        goAtmosphereTime: { value: 0 },
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
                float streakWave = sin(travel * 13.0 + latitude * 4.0) * 0.5 + 0.5;
                float streak = pow(smoothstep(0.68, 1.0, streakWave), 7.0);
                float tailWave = sin(travel * 4.0 - latitude * 11.0) * 0.5 + 0.5;
                float tail = smoothstep(0.48, 0.7, tailWave)
                    * (1.0 - smoothstep(0.84, 0.98, tailWave));
                float rim = pow(1.0 - clamp(
                    dot(vGoAtmosphereViewDirection, vGoAtmosphereNormal),
                    0.0,
                    1.0
                ), 2.1);
                float gust = streak * tail;
                vec3 color = mix(vec3(0.0, 0.56, 0.82), vec3(0.9, 1.0, 1.0), gust);
                float alpha = rim * (0.16 + gust * 0.68);
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

    const ringTilts = [
        [0.48, 0.16, 0.38],
        [-0.34, 0.58, -0.2],
        [0.2, -0.42, 0.72]
    ];

    ringTilts.forEach((tilt, index) => {
        const ringMaterial = new THREE.ShaderMaterial({
            uniforms: {
                goAtmosphereTime: uniforms.goAtmosphereTime,
                goWindDirection: uniforms.goWindDirection,
                goRingOffset: { value: index * 0.29 },
                goRingOpacity: { value: 0.38 - index * 0.045 }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexShader: `
                varying vec2 vGoRingUv;

                void main() {
                    vGoRingUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float goAtmosphereTime;
                uniform float goWindDirection;
                uniform float goRingOffset;
                uniform float goRingOpacity;
                varying vec2 vGoRingUv;

                void main() {
                    float tailPosition = fract(vGoRingUv.x * 5.0
                        - goAtmosphereTime * 1.9 * goWindDirection + goRingOffset);
                    float tail = smoothstep(0.0, 0.045, tailPosition)
                        * (1.0 - smoothstep(0.18, 0.42, tailPosition));
                    float edgeFade = sin(vGoRingUv.y * 3.14159265359);
                    vec3 color = mix(vec3(0.0, 0.68, 0.9), vec3(0.92, 1.0, 1.0), tail);
                    gl_FragColor = vec4(color, tail * edgeFade * goRingOpacity);
                }
            `
        });
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(
                radius * (1.13 + index * 0.035),
                radius * (0.011 + index * 0.002),
                6,
                192
            ),
            ringMaterial
        );
        ring.rotation.set(...tilt);
        ring.renderOrder = 3;
        atmosphere.add(ring);
    });

    atmosphere.userData.goAtmosphereUniforms = uniforms;
    atmosphere.userData.goAtmosphereStartMilliseconds = null;
    return atmosphere;
}

export function updateGoPlanetAtmosphere(atmosphere, nowMilliseconds) {
    const uniforms = atmosphere?.userData?.goAtmosphereUniforms;
    if (!uniforms) return;
    if (atmosphere.userData.goAtmosphereStartMilliseconds === null) {
        atmosphere.userData.goAtmosphereStartMilliseconds = nowMilliseconds;
    }
    uniforms.goAtmosphereTime.value = (
        nowMilliseconds - atmosphere.userData.goAtmosphereStartMilliseconds
    ) / 1000;
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
