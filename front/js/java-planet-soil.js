const JAVA_SOIL_PARTICLE_COUNT = 5200;
const JAVA_SOIL_COLOR = '#b07219';

export function isJavaPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'java';
}

export function createJavaPlanetMaterial(THREE, planetTexture) {
    const material = new THREE.MeshStandardMaterial({
        color: JAVA_SOIL_COLOR,
        map: planetTexture,
        aoMap: planetTexture,
        aoMapIntensity: 1.28,
        roughness: 0.92,
        metalness: 0.04,
        emissive: '#180b05',
        emissiveIntensity: 0.025
    });
    material.customProgramCacheKey = () => 'java-planet-settled-soil-v1';
    return material;
}

function javaSoilHash(value) {
    const hashed = Math.sin(value * 127.1) * 43758.5453;
    return hashed - Math.floor(hashed);
}

export function createJavaPlanetDust(THREE, radius) {
    const positions = new Float32Array(JAVA_SOIL_PARTICLE_COUNT * 3);
    const seeds = new Float32Array(JAVA_SOIL_PARTICLE_COUNT);
    const sizes = new Float32Array(JAVA_SOIL_PARTICLE_COUNT);

    for (let index = 0; index < JAVA_SOIL_PARTICLE_COUNT; index += 1) {
        const seed = javaSoilHash(index * 3.17 + 2.4);
        const latitude = javaSoilHash(index * 7.31 + 9.2) * 2 - 1;
        const longitude = javaSoilHash(index * 11.47 + 4.6) * Math.PI * 2;
        const radial = Math.sqrt(Math.max(0, 1 - latitude * latitude));
        const surfaceRadius = radius * (1.018 + seed * 0.014);
        const offset = index * 3;

        positions[offset] = radial * Math.cos(longitude) * surfaceRadius;
        positions[offset + 1] = radial * Math.sin(longitude) * surfaceRadius;
        positions[offset + 2] = latitude * surfaceRadius;
        seeds[index] = seed;
        sizes[index] = javaSoilHash(index * 17.23 + 1.8);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('javaSoilSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('javaSoilSize', new THREE.BufferAttribute(sizes, 1));

    const uniforms = {
        javaSoilTime: { value: 0 }
    };
    const material = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        vertexShader: `
            uniform float javaSoilTime;
            attribute float javaSoilSeed;
            attribute float javaSoilSize;
            varying float vJavaSoilAlpha;
            varying float vJavaSoilWarmth;

            void main() {
                vec3 surfaceNormal = normalize(position);
                float settle = sin(
                    javaSoilTime * 0.32 + javaSoilSeed * 18.0
                ) * 0.004 * (0.35 + javaSoilSize * 0.65);
                vec3 settledPosition = position + surfaceNormal * settle;
                vec4 viewPosition = modelViewMatrix * vec4(settledPosition, 1.0);
                gl_Position = projectionMatrix * viewPosition;
                gl_PointSize = mix(1.0, 2.8, javaSoilSize)
                    * (12.0 / max(1.0, -viewPosition.z));
                vJavaSoilAlpha = mix(0.18, 0.42, javaSoilSize);
                vJavaSoilWarmth = javaSoilSeed;
            }
        `,
        fragmentShader: `
            varying float vJavaSoilAlpha;
            varying float vJavaSoilWarmth;

            void main() {
                vec2 point = gl_PointCoord * 2.0 - 1.0;
                float distanceFromCenter = length(point);
                if (distanceFromCenter > 1.0) discard;
                float grain = 1.0 - smoothstep(0.0, 1.0, distanceFromCenter);
                vec3 darkSoil = vec3(0.22, 0.09, 0.035);
                vec3 drySoil = vec3(0.58, 0.32, 0.14);
                vec3 soilColor = mix(darkSoil, drySoil, vJavaSoilWarmth);
                gl_FragColor = vec4(soilColor, grain * vJavaSoilAlpha);
            }
        `
    });

    const dust = new THREE.Points(geometry, material);
    dust.renderOrder = 4;
    const group = new THREE.Group();
    group.add(dust);
    group.userData.javaSoilUniforms = uniforms;
    group.userData.javaSoilStartMilliseconds = null;
    return group;
}

export function updateJavaPlanetSoil(target, nowMilliseconds) {
    const uniforms = target?.userData?.javaSoilUniforms;
    if (!uniforms?.javaSoilTime) return;

    if (target.userData.javaSoilStartMilliseconds === null) {
        target.userData.javaSoilStartMilliseconds = nowMilliseconds;
    }
    uniforms.javaSoilTime.value = Math.max(
        0,
        nowMilliseconds - target.userData.javaSoilStartMilliseconds
    ) / 1000;
}
