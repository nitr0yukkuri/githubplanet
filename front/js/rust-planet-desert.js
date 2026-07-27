const RUST_DUST_PARTICLE_COUNT = 260;

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

            void main() {
                vec3 surfaceNormal = normalize(position);
                float life = fract(rustDustTime * 0.052 + rustDustSeed);
                float awake = smoothstep(0.02, 0.1, life)
                    * (1.0 - smoothstep(0.58, 0.72, life));
                float lift = sin(clamp(life / 0.72, 0.0, 1.0) * 3.14159265359) * awake;
                float drift = smoothstep(0.06, 0.48, life)
                    * (1.0 - smoothstep(0.55, 0.72, life));
                float sparse = step(0.38, rustDustSeed);
                vec3 displaced = position
                    + surfaceNormal * lift * 0.055 * length(position)
                    + rustDustTangent * drift * 0.038 * length(position);
                vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
                gl_Position = projectionMatrix * viewPosition;
                gl_PointSize = mix(1.1, 2.8, rustDustSeed)
                    * rustDustPixelRatio * (12.0 / max(1.0, -viewPosition.z));
                vRustDustAlpha = awake * sparse * (0.16 + lift * 0.34);
                vRustDustWarmth = rustDustSeed;
            }
        `,
        fragmentShader: `
            varying float vRustDustAlpha;
            varying float vRustDustWarmth;

            void main() {
                vec2 point = gl_PointCoord * 2.0 - 1.0;
                float radius = length(point);
                if (radius > 1.0) discard;
                float grain = 1.0 - smoothstep(0.28, 1.0, radius);
                vec3 color = mix(
                    vec3(0.48, 0.24, 0.12),
                    vec3(0.84, 0.63, 0.43),
                    vRustDustWarmth
                );
                gl_FragColor = vec4(color, grain * vRustDustAlpha);
            }
        `
    });

    const dust = new THREE.Points(geometry, material);
    dust.renderOrder = 2;
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
