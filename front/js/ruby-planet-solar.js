const RUBY_SOLAR_CYCLE_SECONDS = 18;
const TAU = Math.PI * 2;

export function isRubyPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'ruby';
}

export function createRubyPlanetMaterial(THREE, planetTexture) {
    const material = new THREE.MeshStandardMaterial({
        color: '#CC342D',
        map: planetTexture,
        aoMap: planetTexture,
        aoMapIntensity: 0.9,
        roughness: 0.32,
        metalness: 0.22,
        emissive: '#320504',
        emissiveIntensity: 0.26
    });
    const uniforms = {
        rubySolarTime: { value: 0 }
    };

    material.userData.rubySolarUniforms = uniforms;
    material.onBeforeCompile = (shader) => {
        shader.uniforms.rubySolarTime = uniforms.rubySolarTime;
        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                '#include <common>\nvarying vec3 vRubySolarPosition;\nvarying vec3 vRubySolarViewNormal;\nvarying vec3 vRubySolarViewDirection;'
            )
            .replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\nvRubySolarPosition = normalize(position);\nvRubySolarViewNormal = normalize(normalMatrix * normal);\nvRubySolarViewDirection = normalize(-(modelViewMatrix * vec4(position, 1.0)).xyz);'
            );
        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
uniform float rubySolarTime;
varying vec3 vRubySolarPosition;
varying vec3 vRubySolarViewNormal;
varying vec3 vRubySolarViewDirection;

`
            )
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>
vec3 rubyMappedTexture = diffuseColor.rgb;
diffuseColor.a = 1.0;
float rubyTextureRelief = dot(rubyMappedTexture, vec3(0.299, 0.587, 0.114));
vec3 rubySurfacePosition = normalize(vRubySolarPosition);
vec3 rubySolarAxis = normalize(vec3(0.22, 0.9, 0.34));
vec3 rubySolarBasisX = normalize(cross(rubySolarAxis, vec3(0.0, 0.0, 1.0)));
vec3 rubySolarBasisY = normalize(cross(rubySolarAxis, rubySolarBasisX));
float rubyLongitude = atan(
    dot(rubySurfacePosition, rubySolarBasisY),
    dot(rubySurfacePosition, rubySolarBasisX)
);
float rubyLatitude = dot(rubySurfacePosition, rubySolarAxis);
float rubyPhase = rubySolarTime * ${TAU.toFixed(8)};

float rubyReliefHeat = smoothstep(0.2, 0.84, rubyTextureRelief);
float rubyCellHeat = mix(0.08, 0.2, rubyReliefHeat);
float rubyHeat = clamp(rubyCellHeat * 0.82 + rubyReliefHeat * 0.18, 0.0, 1.0);
float rubyFacing = clamp(
    dot(vRubySolarViewDirection, vRubySolarViewNormal),
    0.0,
    1.0
);
float rubyRim = pow(1.0 - rubyFacing, 2.8);
float rubyHotPulse = pow(
    max(sin(rubyPhase * 2.0 + rubyLongitude * 2.0), 0.0),
    4.0
);
vec3 rubyPaintLightDirection = normalize(vec3(
    0.15 + 0.18 * sin(rubyPhase * 0.5),
    0.18 + 0.08 * cos(rubyPhase * 0.5),
    0.96
));
vec3 rubyPaintHalfVector = normalize(
    rubyPaintLightDirection + vRubySolarViewDirection
);
float rubyCoat = pow(
    max(dot(vRubySolarViewNormal, rubyPaintHalfVector), 0.0),
    44.0
);
float rubyPearlSheen = pow(
    max(dot(vRubySolarViewNormal, rubyPaintLightDirection), 0.0),
    18.0
);
vec2 rubyPearlCell = floor(vec2(
    rubyLongitude * 18.0,
    (rubyLatitude + 1.0) * 9.0
));
float rubyPearlSeed = fract(sin(dot(
    rubyPearlCell,
    vec2(12.9898, 78.233)
)) * 43758.5453);
vec2 rubyPearlLocal = fract(vec2(
    rubyLongitude * 18.0,
    (rubyLatitude + 1.0) * 9.0
)) - 0.5;
float rubyPearlFlake = 1.0 - smoothstep(
    0.03,
    0.16,
    length(rubyPearlLocal)
);
rubyPearlFlake *= smoothstep(0.82, 0.98, rubyPearlSeed)
    * smoothstep(0.12, 0.5, rubyFacing);

vec2 rubySparkCell = floor(vec2(
    rubyLongitude * 42.0,
    (rubyLatitude + 1.0) * 21.0
));
float rubySparkSeed = fract(sin(dot(
    rubySparkCell,
    vec2(41.73, 17.19)
)) * 28571.37);
vec2 rubySparkLocal = fract(vec2(
    rubyLongitude * 42.0,
    (rubyLatitude + 1.0) * 21.0
)) - 0.5;
float rubySparkMask = 1.0 - smoothstep(
    0.035,
    0.16,
    length(rubySparkLocal)
);
rubySparkMask *= smoothstep(0.88, 0.985, rubySparkSeed)
    * smoothstep(0.16, 0.58, rubyFacing);
float rubySparkSpecular = pow(
    max(dot(vRubySolarViewNormal, rubyPaintHalfVector), 0.0),
    36.0
);
float rubySparkPulse = 0.5 + 0.5 * sin(
    rubyPhase * 3.0 + rubySparkSeed * ${TAU.toFixed(8)}
);
float rubySurfaceSpark = rubySparkMask
    * (0.22 + rubySparkSpecular * 1.35)
    * (0.42 + rubySparkPulse * 0.58);

float rubyFireRim = rubyRim * (0.35 + 0.65 * smoothstep(0.2, 0.9, rubyHotPulse));
vec3 rubyFireSource = normalize(vec3(0.0, 0.44, 0.9));
float rubyFireContact = max(dot(rubySurfacePosition, rubyFireSource), 0.0);
float rubyFireHalo = pow(rubyFireContact, 6.0);
float rubyFireCore = pow(rubyFireContact, 16.0);
vec3 rubyDeepSolar = vec3(0.25, 0.006, 0.009);
vec3 rubyRedSolar = vec3(0.92, 0.024, 0.036);
vec3 rubyOrangeSolar = vec3(1.0, 0.2, 0.018);
vec3 rubyHotSolar = vec3(1.0, 0.78, 0.2);
vec3 rubyTerrainColor = mix(rubyDeepSolar, rubyRedSolar, 0.38 + rubyReliefHeat * 0.4);
rubyTerrainColor *= 0.86 + rubyReliefHeat * 0.34;
rubyTerrainColor = mix(rubyTerrainColor, rubyOrangeSolar, rubyHeat * 0.38);
rubyTerrainColor = mix(rubyTerrainColor, rubyHotSolar, rubyHotPulse * rubyHeat * 0.15);
rubyTerrainColor *= 0.92 + rubyFireRim * 0.12;
diffuseColor.rgb = mix(rubyMappedTexture, rubyTerrainColor, 0.64);
diffuseColor.rgb *= 0.9 + rubyHeat * 0.12;
diffuseColor.rgb += vec3(1.0, 0.025, 0.004) * rubyFireHalo * 0.12;
diffuseColor.rgb += vec3(1.0, 0.22, 0.018) * rubyFireCore * 0.1;
vec3 rubyPearlColor = mix(
    vec3(1.0, 0.12, 0.04),
    vec3(1.0, 0.64, 0.24),
    0.35 + rubyHotPulse * 0.4
);
diffuseColor.rgb += rubyPearlColor * rubyCoat * 0.68;
diffuseColor.rgb += vec3(1.0, 0.18, 0.05) * rubyPearlSheen * 0.16;
diffuseColor.rgb += vec3(1.0, 0.3, 0.1) * rubyPearlFlake
    * rubyPearlSheen * 0.18;
diffuseColor.rgb += vec3(1.0, 0.64, 0.34)
    * rubySurfaceSpark * 0.62;`
            )
            .replace(
                '#include <emissivemap_fragment>',
                `#include <emissivemap_fragment>
totalEmissiveRadiance += rubyOrangeSolar * rubyHeat * 0.024;
totalEmissiveRadiance += rubyHotSolar * rubyFireRim * rubyHeat * 0.028;
totalEmissiveRadiance += rubyPearlColor * rubyCoat * 0.038;
totalEmissiveRadiance += vec3(1.0, 0.42, 0.12) * rubySurfaceSpark * 0.08;`
            );
    };
    material.customProgramCacheKey = () => 'ruby-planet-anodized-pearl-v41';
    return material;
}

export function createRubyPlanetCorona(THREE, radius, sharedUniforms) {
    const uniforms = sharedUniforms || { rubySolarTime: { value: 0 } };
    const corona = new THREE.Group();

    const createFlameSprite = ({ phase, widthScale, heightScale }) => {
        const flameMaterial = new THREE.ShaderMaterial({
            uniforms: {
                rubySolarTime: uniforms.rubySolarTime,
                rubyFlamePhase: { value: phase }
            },
            transparent: true,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            vertexShader: `
                varying vec2 vRubyFlameUv;
                void main() {
                    vRubyFlameUv = uv;
                    gl_Position = projectionMatrix
                        * modelViewMatrix
                        * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float rubySolarTime;
                uniform float rubyFlamePhase;
                varying vec2 vRubyFlameUv;

                float rubyHash31(vec3 point) {
                    point = fract(point * 0.1031);
                    point += dot(point, point.yzx + 33.33);
                    return fract((point.x + point.y) * point.z);
                }

                float rubyNoise3(vec3 point) {
                    vec3 cell = floor(point);
                    vec3 local = fract(point);
                    local = local * local * (3.0 - 2.0 * local);
                    float c000 = rubyHash31(cell);
                    float c100 = rubyHash31(cell + vec3(1.0, 0.0, 0.0));
                    float c010 = rubyHash31(cell + vec3(0.0, 1.0, 0.0));
                    float c110 = rubyHash31(cell + vec3(1.0, 1.0, 0.0));
                    float c001 = rubyHash31(cell + vec3(0.0, 0.0, 1.0));
                    float c101 = rubyHash31(cell + vec3(1.0, 0.0, 1.0));
                    float c011 = rubyHash31(cell + vec3(0.0, 1.0, 1.0));
                    float c111 = rubyHash31(cell + vec3(1.0, 1.0, 1.0));
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
                }

                float rubyFireFbm(vec3 point) {
                    return clamp(
                        rubyNoise3(point) * 0.62
                            + rubyNoise3(point * 2.15 + vec3(4.2, 1.7, 8.3)) * 0.38,
                        0.0,
                        1.0
                    );
                }

                float rubyFlameDensity(vec3 point, float time, float phase) {
                    float height = clamp((point.y + 0.3) / 1.4, 0.0, 1.0);
                    float sway = 0.06 * sin(time * 2.0 + phase)
                        + height * (
                            0.34 * sin(time * 2.0 + phase + height * 4.2)
                            + 0.13 * sin(time * 4.0 - phase + height * 9.0)
                        );
                    vec3 flow = vec3(
                        sin(time * 2.0 + phase) * 0.34,
                        -time * 0.7 + cos(time * 2.0 + phase * 0.7) * 0.16,
                        sin(time * 4.0 - phase) * 0.28
                    );
                    float turbulence = rubyFireFbm(
                        point * vec3(2.8, 2.6, 3.2) + flow
                    );
                    float width = mix(0.94, 0.17, pow(height, 0.62));
                    float centerNoise = rubyFireFbm(
                        point * vec3(2.1, 2.6, 3.4)
                            + flow * 0.72
                            + vec3(5.7, 2.4, 1.3)
                    );
                    float flameCenter = sway
                        + (centerNoise - 0.5) * mix(0.06, 0.2, height);
                    float radialDistance = length(vec2(
                        (point.x - flameCenter) / max(width, 0.001),
                        point.z / 0.58
                    ));
                    float edgeNoise = rubyNoise3(
                        point * vec3(5.6, 8.0, 6.8)
                            + flow * 1.6
                            + vec3(7.1, 1.8, 3.6)
                    );
                    float envelope = 1.0 - smoothstep(
                        0.3,
                        1.0,
                        radialDistance - (edgeNoise - 0.5) * 0.24
                    );
                    float rootLick = 0.045 * sin(
                        point.x * 8.0 + time * 1.4 + phase
                    ) + 0.025 * (
                        rubyNoise3(point * vec3(3.0, 1.0, 2.0) + flow)
                        - 0.5
                    );
                    float rootFade = smoothstep(
                        -0.34 + rootLick,
                        -0.06 + rootLick,
                        point.y
                    );
                    float tipFade = 1.0 - smoothstep(0.92, 1.12, height);
                    return clamp(
                        envelope * rootFade * tipFade
                            * (0.25 + turbulence * 0.9),
                        0.0,
                        1.0
                    );
                }

                void main() {
                    vec2 point = vec2(
                        (vRubyFlameUv.x - 0.5) * 2.0,
                        vRubyFlameUv.y * 1.45 - 0.35
                    );
                    float flameTime = rubySolarTime * 6.28318530718;
                    vec3 accumulatedColor = vec3(0.0);
                    float transmittance = 1.0;
                    for (int step = 0; step < 12; step++) {
                        float depth = -0.58 + (float(step) + 0.5) * 0.1;
                        vec3 samplePoint = vec3(point, depth);
                        float density = rubyFlameDensity(
                            samplePoint,
                            flameTime,
                            rubyFlamePhase
                        );
                        float height = clamp(
                            (samplePoint.y + 0.3) / 1.4,
                            0.0,
                            1.0
                        );
                        float absorption = density * 0.11;
                        float emberHeat = smoothstep(0.06, 0.48, density);
                        float coreHeat = smoothstep(0.62, 0.96, density)
                            * (1.0 - smoothstep(0.5, 1.0, height));
                        vec3 outerColor = vec3(0.58, 0.012, 0.001);
                        vec3 emberColor = vec3(1.0, 0.12, 0.004);
                        vec3 hotColor = vec3(1.0, 0.78, 0.18);
                        vec3 sampleColor = mix(outerColor, emberColor, emberHeat);
                        sampleColor = mix(sampleColor, hotColor, coreHeat * 0.8);
                        sampleColor *= 0.72 + 0.32 * (1.0 - height);
                        accumulatedColor += transmittance
                            * sampleColor * absorption * 3.25;
                        transmittance *= 1.0 - absorption;
                    }
                    float alpha = clamp((1.0 - transmittance) * 1.3, 0.0, 0.96);
                    float shimmer = 0.9 + 0.1 * sin(
                        flameTime * 2.0 + rubyFlamePhase
                    );
                    gl_FragColor = vec4(
                        accumulatedColor * shimmer * 1.12,
                        alpha * shimmer
                    );
                }
            `
        });
        const flameGeometry = new THREE.PlaneGeometry(1, 1);
        const flame = new THREE.Mesh(flameGeometry, flameMaterial);
        const flameAnchor = new THREE.Vector3(0, radius * 0.48, 0);
        flame.position.copy(flameAnchor);
        flame.scale.set(radius * widthScale, radius * heightScale, 1);
        flame.userData.rubyFlameAnchor = flameAnchor;
        flame.renderOrder = 3;
        return flame;
    };

    const createFlameSparks = () => {
        const sparkData = [
            [-0.16, 1.1, 0.02, 0.42, 0.04, 0.18],
            [0.12, 1.16, -0.03, 0.34, 0.17, 0.15],
            [-0.04, 1.24, 0.05, 0.5, 0.29, 0.2],
            [0.2, 1.3, -0.04, 0.3, 0.41, 0.14],
            [-0.23, 1.34, 0.01, 0.38, 0.53, 0.16],
            [0.04, 1.42, -0.02, 0.26, 0.65, 0.13],
            [-0.1, 1.48, 0.04, 0.32, 0.77, 0.17],
            [0.26, 1.52, 0.0, 0.24, 0.89, 0.12],
            [-0.28, 1.58, -0.03, 0.28, 0.11, 0.14],
            [0.08, 1.64, 0.02, 0.22, 0.35, 0.11],
            [-0.18, 1.7, 0.01, 0.2, 0.59, 0.12],
            [0.16, 1.76, -0.02, 0.18, 0.83, 0.1]
        ];
        const positions = [];
        const seeds = [];
        const phases = [];
        const rises = [];
        const sizes = [];
        sparkData.forEach(([x, y, z, rise, phase, size], index) => {
            positions.push(x * radius, y * radius, z * radius);
            seeds.push(index * 0.73 + phase * 2.0);
            phases.push(phase);
            rises.push(rise * radius);
            sizes.push(size);
        });
        const sparkGeometry = new THREE.BufferGeometry();
        sparkGeometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
        sparkGeometry.setAttribute(
            'rubySparkSeed',
            new THREE.Float32BufferAttribute(seeds, 1)
        );
        sparkGeometry.setAttribute(
            'rubySparkPhase',
            new THREE.Float32BufferAttribute(phases, 1)
        );
        sparkGeometry.setAttribute(
            'rubySparkRise',
            new THREE.Float32BufferAttribute(rises, 1)
        );
        sparkGeometry.setAttribute(
            'rubySparkSize',
            new THREE.Float32BufferAttribute(sizes, 1)
        );
        const sparkMaterial = new THREE.ShaderMaterial({
            uniforms: { rubySolarTime: uniforms.rubySolarTime },
            transparent: true,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
            vertexShader: `
                uniform float rubySolarTime;
                attribute float rubySparkSeed;
                attribute float rubySparkPhase;
                attribute float rubySparkRise;
                attribute float rubySparkSize;
                varying float vRubySparkAlpha;
                varying float vRubySparkHeat;
                void main() {
                    float life = fract(rubySolarTime * 1.65 + rubySparkPhase);
                    float fadeIn = smoothstep(0.0, 0.12, life);
                    float fadeOut = 1.0 - smoothstep(0.64, 1.0, life);
                    float rise = smoothstep(0.04, 0.22, life);
                    float driftPhase = rubySolarTime * 10.367
                        + rubySparkSeed * 5.7 + life * 3.0;
                    vec3 sparkPosition = position;
                    sparkPosition.x += sin(driftPhase)
                        * (0.02 + rise * rubySparkRise * 0.24);
                    sparkPosition.z += cos(driftPhase * 0.83)
                        * (0.01 + rise * rubySparkRise * 0.15);
                    sparkPosition.y += rise * rubySparkRise;
                    vec4 viewPosition = modelViewMatrix
                        * vec4(sparkPosition, 1.0);
                    gl_PointSize = rubySparkSize
                        * (1.0 + (1.0 - rise) * 0.35)
                        * (260.0 / max(-viewPosition.z, 1.0));
                    vRubySparkAlpha = fadeIn * fadeOut;
                    vRubySparkHeat = 1.0 - smoothstep(0.18, 0.68, life);
                    gl_Position = projectionMatrix * viewPosition;
                }
            `,
            fragmentShader: `
                varying float vRubySparkAlpha;
                varying float vRubySparkHeat;
                void main() {
                    float distanceFromCenter = length(
                        gl_PointCoord - vec2(0.5)
                    );
                    float halo = 1.0 - smoothstep(0.12, 0.5, distanceFromCenter);
                    float core = 1.0 - smoothstep(0.0, 0.24, distanceFromCenter);
                    float alpha = halo * vRubySparkAlpha * 0.9;
                    if (alpha <= 0.001) discard;
                    vec3 emberColor = vec3(1.0, 0.12, 0.004);
                    vec3 hotColor = vec3(1.0, 0.86, 0.28);
                    vec3 color = mix(emberColor, hotColor, core * vRubySparkHeat);
                    gl_FragColor = vec4(color, alpha);
                }
            `
        });
        const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
        sparks.renderOrder = 4;
        return sparks;
    };

    const flameSprite = createFlameSprite({
        phase: 0.7,
        widthScale: 1.58,
        heightScale: 1.96
    });
    const flameSparks = createFlameSparks();
    corona.add(flameSprite);
    corona.add(flameSparks);
    corona.userData.rubyFlameSprite = flameSprite;
    corona.userData.rubyFlameSparks = flameSparks;
    corona.userData.rubySolarUniforms = uniforms;
    return corona;
}

export function updateRubyPlanetSolar(target, nowMilliseconds, camera) {
    const uniforms = target?.userData?.rubySolarUniforms;
    if (!uniforms?.rubySolarTime) return;
    uniforms.rubySolarTime.value = (
        nowMilliseconds / 1000 % RUBY_SOLAR_CYCLE_SECONDS
    ) / RUBY_SOLAR_CYCLE_SECONDS;

    const flameSprite = target.userData.rubyFlameSprite;
    const flameSparks = target.userData.rubyFlameSparks;
    const parent = target.parent;
    if (flameSprite?.userData?.rubyFlameAnchor && parent?.quaternion) {
        const billboardState = target.userData.rubyBillboardState
            || (target.userData.rubyBillboardState = {
                inverseParentQuaternion: parent.quaternion.clone(),
                cameraFacingQuaternion: parent.quaternion.clone()
            });
        const inverseParentQuaternion = billboardState.inverseParentQuaternion
            .copy(parent.quaternion)
            .invert();
        const cameraFacingQuaternion = billboardState.cameraFacingQuaternion;
        if (camera?.quaternion) {
            cameraFacingQuaternion
                .copy(inverseParentQuaternion)
                .multiply(camera.quaternion);
        } else {
            cameraFacingQuaternion.copy(inverseParentQuaternion);
        }
        flameSprite.position
            .copy(flameSprite.userData.rubyFlameAnchor)
            .applyQuaternion(inverseParentQuaternion);
        flameSprite.quaternion.copy(cameraFacingQuaternion);
        if (flameSparks) {
            flameSparks.quaternion.copy(inverseParentQuaternion);
        }
    }
}
