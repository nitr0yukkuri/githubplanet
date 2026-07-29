const RUST_DUST_PARTICLE_COUNT = 12000;

export function isRustPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'rust';
}

export function createRustPlanetMaterial(THREE, planetTexture) {
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: planetTexture,
        aoMap: planetTexture,
        aoMapIntensity: 0.72,
        roughness: 0.78,
        metalness: 0.26
    });
    const uniforms = {
        rustDesertTime: { value: 0 }
    };

    material.onBeforeCompile = (shader) => {
        shader.uniforms.rustDesertTime = uniforms.rustDesertTime;
        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                '#include <common>\nvarying vec3 vRustDesertPosition;'
            )
            .replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\nvRustDesertPosition = position;'
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
uniform float rustDesertTime;
varying vec3 vRustDesertPosition;

float rustDesertHash(vec2 value) {
    return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
}`
            )
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>
vec3 rustMappedTexture = diffuseColor.rgb;
float rustTextureRelief = dot(rustMappedTexture, vec3(0.299, 0.587, 0.114));
vec3 rustSurfacePosition = normalize(vRustDesertPosition);

vec3 rustAxis = normalize(vec3(0.22, 0.94, 0.26));
vec3 rustBasisX = normalize(cross(rustAxis, vec3(0.0, 0.0, 1.0)));
vec3 rustBasisY = normalize(cross(rustAxis, rustBasisX));
float rustLongitude = atan(
    dot(rustSurfacePosition, rustBasisY),
    dot(rustSurfacePosition, rustBasisX)
);
float rustLatitude = dot(rustSurfacePosition, rustAxis);

float rustMacroNoise = rustDesertHash(floor(vec2(
    rustLongitude * 4.2,
    rustLatitude * 13.0
)));
float rustCraterDepth = 1.0 - smoothstep(0.22, 0.64, rustTextureRelief);
float rustSandDeposit = clamp(rustCraterDepth * (0.58 + rustMacroNoise * 0.42), 0.0, 1.0);

float rustTravel = rustLongitude * 15.0
    + rustLatitude * 18.0
    - rustDesertTime * 0.62;
float rustGrainBand = sin(rustTravel + rustMacroNoise * 5.0) * 0.5 + 0.5;
float rustShortGrain = pow(smoothstep(0.78, 1.0, rustGrainBand), 9.0);
float rustGrainGate = sin(
    rustLongitude * 5.0 - rustLatitude * 23.0 + rustMacroNoise * 8.0
) * 0.5 + 0.5;
rustShortGrain *= smoothstep(0.62, 0.88, rustGrainGate);
rustShortGrain *= 0.35 + rustSandDeposit * 0.65;

float rustContrastedRelief = clamp((rustTextureRelief - 0.5) * 1.55 + 0.5, 0.0, 1.0);
float rustOxidePatch = smoothstep(0.42, 0.8, rustContrastedRelief)
    * (0.72 + rustMacroNoise * 0.28);
vec3 rustDeepStone = vec3(0.19, 0.075, 0.045);
vec3 rustOxide = vec3(0.56, 0.235, 0.12);
vec3 rustSandstone = vec3(0.76, 0.49, 0.29);
vec3 rustDrySand = vec3(0.87, 0.66, 0.47);
vec3 rustTerrain = mix(rustDeepStone, rustOxide, rustContrastedRelief);
rustTerrain = mix(rustTerrain, rustSandstone, rustOxidePatch * 0.42);
rustTerrain = mix(rustTerrain, rustDrySand, rustSandDeposit * 0.5);
rustTerrain = mix(rustTerrain, rustDrySand, rustShortGrain * 0.28);
rustTerrain *= 0.68 + rustContrastedRelief * 0.48;
diffuseColor.rgb = mix(rustMappedTexture, rustTerrain, 0.8);`
            );
    };

    material.customProgramCacheKey = () => 'rust-planet-arid-ownership-desert-v1';
    material.userData.rustDesertUniforms = uniforms;
    material.userData.rustDesertStartMilliseconds = null;
    return material;
}

export function createRustPlanetDust(THREE, radius) {
    const positions = new Float32Array(RUST_DUST_PARTICLE_COUNT * 3);
    const tangents = new Float32Array(RUST_DUST_PARTICLE_COUNT * 3);
    const seeds = new Float32Array(RUST_DUST_PARTICLE_COUNT);
    let randomState = 0x6d2b79f5;
    const random = () => {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        return randomState / 4294967296;
    };

    for (let index = 0; index < RUST_DUST_PARTICLE_COUNT; index++) {
        const z = random() * 2 - 1;
        const angle = random() * Math.PI * 2;
        const radial = Math.sqrt(Math.max(0, 1 - z * z));
        const normalX = radial * Math.cos(angle);
        const normalY = radial * Math.sin(angle);
        const normalZ = z;
        const tangentLength = Math.hypot(-normalY, normalX) || 1;
        const offset = index * 3;

        positions[offset] = normalX * radius * 1.006;
        positions[offset + 1] = normalY * radius * 1.006;
        positions[offset + 2] = normalZ * radius * 1.006;
        tangents[offset] = -normalY / tangentLength;
        tangents[offset + 1] = normalX / tangentLength;
        tangents[offset + 2] = (random() - 0.5) * 0.16;
        seeds[index] = random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('rustDustTangent', new THREE.BufferAttribute(tangents, 3));
    geometry.setAttribute('rustDustSeed', new THREE.BufferAttribute(seeds, 1));

    const uniforms = {
        rustDustTime: { value: 0 },
        rustDustPixelRatio: { value: Math.min(2, globalThis.devicePixelRatio || 1) }
    };
    const material = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        vertexShader: `
            uniform float rustDustTime;
            uniform float rustDustPixelRatio;
            attribute vec3 rustDustTangent;
            attribute float rustDustSeed;
            varying float vRustDustAlpha;
            varying float vRustDustWarmth;
            varying float vRustDustCoarse;
            varying vec2 vRustDustScreenTangent;

            void main() {
                vec3 surfaceNormal = normalize(position);
                float coarse = step(0.84, rustDustSeed);
                float particleSpeed = mix(0.72, 1.08, coarse);
                float life = fract(rustDustTime * 0.064 * particleSpeed + rustDustSeed);
                float awake = smoothstep(0.02, 0.1, life)
                    * (1.0 - smoothstep(0.58, 0.72, life));
                float lift = sin(clamp(life / 0.72, 0.0, 1.0) * 3.14159265359) * awake;
                float drift = smoothstep(0.06, 0.48, life)
                    * (1.0 - smoothstep(0.55, 0.72, life));
                float sparse = step(0.08, rustDustSeed);

                vec3 dustAxis = normalize(vec3(0.3, 0.88, 0.36));
                vec3 dustBasisX = normalize(cross(dustAxis, vec3(0.0, 0.0, 1.0)));
                vec3 dustBasisY = normalize(cross(dustAxis, dustBasisX));
                float longitude = atan(
                    dot(surfaceNormal, dustBasisY),
                    dot(surfaceNormal, dustBasisX)
                );
                float latitude = dot(surfaceNormal, dustAxis);
                float bandTravel = longitude + latitude * 2.15
                    - rustDustTime * 0.95 * particleSpeed;
                float stormBandWave = sin(
                    bandTravel * 3.0 + sin(latitude * 7.0) * 0.32
                ) * 0.5 + 0.5;
                float stormBand = smoothstep(0.56, 0.84, stormBandWave);

                float liftDistance = mix(0.056, 0.09, coarse);
                float driftDistance = mix(0.14, 0.22, coarse);
                vec3 displaced = position
                    + surfaceNormal * lift * liftDistance * length(position)
                    + rustDustTangent * drift * driftDistance * length(position);
                vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
                gl_Position = projectionMatrix * viewPosition;
                gl_PointSize = mix(
                    mix(1.0, 2.2, rustDustSeed),
                    mix(2.2, 4.0, rustDustSeed),
                    coarse
                )
                    * rustDustPixelRatio * (12.0 / max(1.0, -viewPosition.z));
                vec3 viewTangent = normalize(mat3(modelViewMatrix) * rustDustTangent);
                vec2 screenTangent = (projectionMatrix * vec4(viewTangent, 0.0)).xy;
                vRustDustScreenTangent = screenTangent
                    / max(length(screenTangent), 0.0001);
                vRustDustAlpha = awake * sparse * stormBand
                    * mix(0.2 + lift * 0.24, 0.24 + lift * 0.28, coarse);
                vRustDustWarmth = rustDustSeed;
                vRustDustCoarse = coarse;
            }
        `,
        fragmentShader: `
            varying float vRustDustAlpha;
            varying float vRustDustWarmth;
            varying float vRustDustCoarse;
            varying vec2 vRustDustScreenTangent;

            void main() {
                vec2 point = gl_PointCoord * 2.0 - 1.0;
                vec2 tangent = normalize(vRustDustScreenTangent);
                vec2 perpendicular = vec2(-tangent.y, tangent.x);
                vec2 orientedPoint = vec2(
                    dot(point, tangent) * mix(0.74, 0.56, vRustDustCoarse),
                    dot(point, perpendicular)
                );
                float radius = length(orientedPoint);
                if (radius > 1.0) discard;
                float grain = 1.0 - smoothstep(0.0, 1.0, radius);
                vec3 color = mix(
                    vec3(0.4, 0.19, 0.09),
                    vec3(0.64, 0.42, 0.24),
                    vRustDustWarmth
                );
                gl_FragColor = vec4(color, grain * vRustDustAlpha);
            }
        `
    });

    const dustPoints = new THREE.Points(geometry, material);
    dustPoints.renderOrder = 4;

    const createDustShell = ({ radiusScale, phase, opacity, outer }) => {
        const shellMaterial = new THREE.ShaderMaterial({
            uniforms: {
                rustDustTime: uniforms.rustDustTime,
                rustDustPhase: { value: phase },
                rustDustOpacity: { value: opacity },
                rustDustOuterLayer: { value: outer ? 1 : 0 }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending,
            side: outer ? THREE.BackSide : THREE.FrontSide,
            vertexShader: `
                varying vec3 vRustShellNormal;
                varying vec3 vRustShellViewDirection;
                varying vec3 vRustShellPosition;

                void main() {
                    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                    vRustShellNormal = normalize(normalMatrix * normal);
                    vRustShellViewDirection = normalize(-viewPosition.xyz);
                    vRustShellPosition = normalize(position);
                    gl_Position = projectionMatrix * viewPosition;
                }
            `,
            fragmentShader: `
                uniform float rustDustTime;
                uniform float rustDustPhase;
                uniform float rustDustOpacity;
                uniform float rustDustOuterLayer;
                varying vec3 vRustShellNormal;
                varying vec3 vRustShellViewDirection;
                varying vec3 vRustShellPosition;

                float rustShellHash(vec2 value) {
                    return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
                }

                void main() {
                    vec3 dustAxis = normalize(vec3(0.3, 0.88, 0.36));
                    vec3 dustBasisX = normalize(cross(dustAxis, vec3(0.0, 0.0, 1.0)));
                    vec3 dustBasisY = normalize(cross(dustAxis, dustBasisX));
                    float longitude = atan(
                        dot(vRustShellPosition, dustBasisY),
                        dot(vRustShellPosition, dustBasisX)
                    );
                    float latitude = dot(vRustShellPosition, dustAxis);
                    float travel = longitude + latitude * 2.15
                        - rustDustTime * 0.95 + rustDustPhase;
                    float flowBand = sin(travel * 3.0 + sin(latitude * 7.0) * 0.32)
                        * 0.5 + 0.5;
                    flowBand = smoothstep(0.52, 0.86, flowBand);

                    vec2 grainCoordinate = vec2(
                        (longitude - rustDustTime * 0.95) * 42.0
                            + latitude * 19.0 + rustDustPhase * 4.0,
                        latitude * 72.0 + sin(longitude * 3.0) * 2.0
                    );
                    vec2 grainCell = floor(grainCoordinate);
                    vec2 grainLocal = fract(grainCoordinate);
                    vec2 grainCenter = vec2(
                        rustShellHash(grainCell + vec2(17.0, 3.0)),
                        rustShellHash(grainCell + vec2(5.0, 29.0))
                    );
                    vec2 grainDelta = grainLocal - grainCenter;
                    grainDelta.x *= 0.46;
                    float grainSeed = rustShellHash(grainCell + vec2(41.0, 11.0));
                    float grainParticle = 1.0 - smoothstep(
                        0.075,
                        0.19,
                        length(grainDelta)
                    );
                    grainParticle *= smoothstep(0.38, 0.82, grainSeed);

                    vec2 fineCoordinate = vec2(
                        (longitude - rustDustTime * 1.08) * 67.0
                            + latitude * 27.0 - rustDustPhase * 3.0,
                        latitude * 96.0 - sin(longitude * 4.0) * 2.5
                    );
                    vec2 fineCell = floor(fineCoordinate);
                    vec2 fineLocal = fract(fineCoordinate);
                    vec2 fineCenter = vec2(
                        rustShellHash(fineCell + vec2(13.0, 37.0)),
                        rustShellHash(fineCell + vec2(31.0, 7.0))
                    );
                    vec2 fineDelta = fineLocal - fineCenter;
                    fineDelta.x *= 0.4;
                    float fineSeed = rustShellHash(fineCell + vec2(23.0, 47.0));
                    float fineParticle = 1.0 - smoothstep(
                        0.055,
                        0.15,
                        length(fineDelta)
                    );
                    fineParticle *= smoothstep(0.5, 0.86, fineSeed);

                    float dustPocket = rustShellHash(floor(vec2(
                        travel * 5.0,
                        latitude * 14.0 + rustDustPhase
                    )));
                    float cloudBreakup = smoothstep(0.28, 0.78, dustPocket);
                    float grain = clamp(
                        grainParticle + fineParticle * 0.72,
                        0.0,
                        1.0
                    );
                    float latitudeFade = 1.0 - smoothstep(0.74, 1.0, abs(latitude));
                    float facing = clamp(
                        dot(vRustShellViewDirection, vRustShellNormal),
                        0.0,
                        1.0
                    );
                    float rim = pow(1.0 - facing, 2.15);
                    float dustyFlow = flowBand * cloudBreakup;
                    float gustExposure = smoothstep(0.34, 0.76, dustyFlow);
                    float surfaceAlpha = facing * latitudeFade
                        * (dustyFlow * 0.025 + grain * (0.16 + dustyFlow * 0.2));
                    float outerAlpha = rim * latitudeFade
                        * (dustyFlow * 0.018
                            + grain * gustExposure * (0.28 + dustyFlow * 0.36));
                    float alpha = mix(surfaceAlpha, outerAlpha, rustDustOuterLayer)
                        * rustDustOpacity;
                    vec3 darkDust = vec3(0.38, 0.16, 0.075);
                    vec3 sandDust = vec3(0.76, 0.49, 0.28);
                    vec3 paleDust = vec3(0.88, 0.68, 0.46);
                    vec3 color = mix(darkDust, sandDust, flowBand);
                    color = mix(color, paleDust, grain * 0.62);
                    gl_FragColor = vec4(color, alpha);
                }
            `
        });
        const shell = new THREE.Mesh(
            new THREE.SphereGeometry(radius * radiusScale, 48, 48),
            shellMaterial
        );
        shell.renderOrder = outer ? 3 : 2;
        return shell;
    };

    const dust = new THREE.Group();
    dust.add(createDustShell({ radiusScale: 1.035, phase: 0, opacity: 0.92, outer: false }));
    dust.add(createDustShell({ radiusScale: 1.105, phase: 1.7, opacity: 0.34, outer: true }));
    dust.add(createDustShell({ radiusScale: 1.17, phase: 3.25, opacity: 0.08, outer: true }));
    dust.add(dustPoints);
    dust.userData.rustDustUniforms = uniforms;
    dust.userData.rustDustStartMilliseconds = null;
    return dust;
}

export function updateRustPlanetDesert(target, nowMilliseconds) {
    const uniforms = target?.userData?.rustDesertUniforms
        || target?.userData?.rustDustUniforms;
    if (!uniforms) return;

    const startKey = target.userData.rustDesertUniforms
        ? 'rustDesertStartMilliseconds'
        : 'rustDustStartMilliseconds';
    if (target.userData[startKey] === null) {
        target.userData[startKey] = nowMilliseconds;
    }
    const elapsedSeconds = Math.max(0, nowMilliseconds - target.userData[startKey]) / 1000;
    if (uniforms.rustDesertTime) uniforms.rustDesertTime.value = elapsedSeconds;
    if (uniforms.rustDustTime) uniforms.rustDustTime.value = elapsedSeconds;
}
