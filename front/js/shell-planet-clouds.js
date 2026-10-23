const SHELL_CLOUD_CYCLE_SECONDS = 32;
const SHELL_CLOUD_SHADER_VERSION = 'shell-planet-clouds-v18-coordinate-consistent-lighting';
const SHELL_TERRAIN_SHADER_VERSION = 'shell-planet-terrain-v4-white-relief-cloud-shadow';

const SHELL_CLOUD_NOISE_GLSL = `
float shellCloudHash(vec3 value) {
    return fract(sin(dot(value, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float shellCloudNoise(vec3 value) {
    vec3 cell = floor(value);
    vec3 local = fract(value);
    local = local * local * (3.0 - 2.0 * local);
    float lowerFront = mix(
        shellCloudHash(cell),
        shellCloudHash(cell + vec3(1.0, 0.0, 0.0)),
        local.x
    );
    float lowerBack = mix(
        shellCloudHash(cell + vec3(0.0, 0.0, 1.0)),
        shellCloudHash(cell + vec3(1.0, 0.0, 1.0)),
        local.x
    );
    float upperFront = mix(
        shellCloudHash(cell + vec3(0.0, 1.0, 0.0)),
        shellCloudHash(cell + vec3(1.0, 1.0, 0.0)),
        local.x
    );
    float upperBack = mix(
        shellCloudHash(cell + vec3(0.0, 1.0, 1.0)),
        shellCloudHash(cell + vec3(1.0, 1.0, 1.0)),
        local.x
    );
    return mix(
        mix(lowerFront, lowerBack, local.z),
        mix(upperFront, upperBack, local.z),
        local.y
    );
}

vec3 shellCloudRotate(vec3 position, vec3 axis, float angle) {
    float sine = sin(angle);
    float cosine = cos(angle);
    return position * cosine
        + cross(axis, position) * sine
        + axis * dot(axis, position) * (1.0 - cosine);
}

vec3 shellCloudFlowPosition(vec3 position, float time) {
    float phase = time * 6.28318530718;
    vec3 windAxis = normalize(vec3(0.22, 0.91, 0.34));
    vec3 flowed = shellCloudRotate(normalize(position), windAxis, phase);
    // 主風は一定方向に流し、輪郭だけを整数倍の周期でゆっくり変形させる。
    vec3 shapeWarp = vec3(
        sin(flowed.y * 3.4 + phase * 2.0),
        cos(flowed.z * 3.0 - phase * 2.0),
        sin(flowed.x * 3.8 + phase * 2.0 + 1.4)
    ) * 0.032;
    return flowed + shapeWarp;
}

float shellCloudField(vec3 position, float time) {
    vec3 flowed = shellCloudFlowPosition(position, time);
    float macroCloud = shellCloudNoise(flowed * 1.32);
    float broadCloud = shellCloudNoise(flowed * 2.35 + vec3(0.0, 0.08, 0.0));
    float edgeCloud = shellCloudNoise(flowed * 5.0 - vec3(0.06, 0.0, 0.04));
    // 大きな塊を優先し、細かいノイズは輪郭のふくらみにだけ使う。
    return clamp(macroCloud * 0.69 + broadCloud * 0.25 + edgeCloud * 0.06, 0.0, 1.0);
}

float shellCloudDensity(vec3 position, float time) {
    vec3 flowed = shellCloudFlowPosition(position, time);
    float field = shellCloudField(position, time);
    float cloudMass = smoothstep(0.40, 0.60, field);
    float puffNoise = shellCloudNoise(flowed * 4.4 + vec3(0.0, 0.17, 0.0));
    float softPuffs = mix(0.78, 1.08, smoothstep(0.18, 0.82, puffNoise));
    // 雲塊の外側だけを少し崩す。雲のない場所には最低不透明度を置かない。
    return clamp(cloudMass * softPuffs, 0.0, 1.0);
}

float shellCloudLightShadow(vec3 position, float time, vec3 sunDirection) {
    vec3 direction = normalize(sunDirection);
    float nearDensity = shellCloudDensity(
        normalize(position + direction * 0.10),
        time
    );
    float farDensity = shellCloudDensity(
        normalize(position + direction * 0.22),
        time
    );
    return clamp(nearDensity * 0.68 + farDensity * 0.32, 0.0, 1.0);
}
`;

function createShellCloudVector(THREE, x, y, z) {
    return THREE.Vector3
        ? new THREE.Vector3(x, y, z)
        : { x, y, z };
}

function createShellCloudUniforms(THREE, intensity = 1) {
    return {
        shellCloudTime: { value: 0 },
        shellCloudIntensity: { value: Math.max(0, Math.min(1, intensity)) },
        // ShaderMaterialは通常のライトを受けないため、雲専用に太陽方向を渡す。
        shellCloudSunDirection: {
            value: createShellCloudVector(THREE, 0.58, 0.36, 0.73)
        }
    };
}

export function isShellPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'shell';
}

export function createShellPlanetMaterial(THREE, planetTexture) {
    const uniforms = createShellCloudUniforms(THREE);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: planetTexture,
        aoMap: planetTexture,
        aoMapIntensity: 0.92,
        roughness: 0.84,
        metalness: 0.12
    });
    material.userData = material.userData || {};
    material.userData.shellCloudUniforms = uniforms;
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                '#include <common>\nvarying vec3 vShellTerrainPosition;'
            )
            .replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\nvShellTerrainPosition = normalize(transformed);'
            );
        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
uniform float shellCloudTime;
uniform float shellCloudIntensity;
varying vec3 vShellTerrainPosition;
${SHELL_CLOUD_NOISE_GLSL}`
            )
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>
vec3 shellMappedTexture = diffuseColor.rgb;
float shellTerrainRelief = dot(shellMappedTexture, vec3(0.299, 0.587, 0.114));
float shellCloudShadow = smoothstep(
    0.46,
    0.72,
    shellCloudField(vShellTerrainPosition, shellCloudTime)
);
// 白い惑星として読ませつつ、Marsテクスチャの輝度差だけを地形の起伏として残す。
vec3 shellPaleTerrain = mix(
    vec3(0.56, 0.60, 0.68),
    vec3(0.96, 0.98, 1.0),
    smoothstep(0.16, 0.82, shellTerrainRelief)
);
vec3 shellTerrainBase = mix(shellPaleTerrain, shellMappedTexture, 0.06);
vec3 shellShadowedTerrain = shellTerrainBase * mix(
    vec3(1.0),
    vec3(0.78, 0.84, 0.92),
    shellCloudShadow * 0.34 * shellCloudIntensity
);
diffuseColor.rgb = shellShadowedTerrain;`
            );
    };
    material.customProgramCacheKey = () => SHELL_TERRAIN_SHADER_VERSION;
    return material;
}

function createCloudMaterial(THREE, uniforms, opacity) {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            shellCloudTime: uniforms.shellCloudTime,
            shellCloudIntensity: uniforms.shellCloudIntensity,
            shellCloudSunDirection: uniforms.shellCloudSunDirection,
            shellCloudOpacity: { value: opacity }
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        side: THREE.FrontSide,
        vertexShader: `
            uniform vec3 shellCloudSunDirection;
            varying vec3 vShellCloudPosition;
            varying vec3 vShellCloudNormal;
            varying vec3 vShellCloudViewDirection;
            varying vec3 vShellCloudSunDirection;

            void main() {
                vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                vShellCloudPosition = normalize(position);
                vShellCloudNormal = normalize(normalMatrix * normal);
                // 法線・視線と太陽方向をビュー空間へそろえ、カメラ回転で照明がずれないようにする。
                vShellCloudSunDirection = normalize(normalMatrix * shellCloudSunDirection);
                vShellCloudViewDirection = normalize(-viewPosition.xyz);
                gl_Position = projectionMatrix * viewPosition;
            }
        `,
        fragmentShader: `
            uniform float shellCloudTime;
            uniform float shellCloudIntensity;
            uniform float shellCloudOpacity;
            varying vec3 vShellCloudPosition;
            varying vec3 vShellCloudNormal;
            varying vec3 vShellCloudViewDirection;
            varying vec3 vShellCloudSunDirection;

            ${SHELL_CLOUD_NOISE_GLSL}

            void main() {
                float cloudDensity = shellCloudDensity(
                    vShellCloudPosition,
                    shellCloudTime
                );
                float latitudeFade = 1.0 - smoothstep(
                    0.42,
                    0.96,
                    abs(vShellCloudPosition.y)
                ) * 0.16;
                cloudDensity = clamp(cloudDensity * latitudeFade, 0.0, 1.0);

                float facing = clamp(
                    dot(vShellCloudNormal, vShellCloudViewDirection),
                    0.0,
                    1.0
                );
                float limbFade = mix(
                    0.54,
                    1.0,
                    smoothstep(0.0, 0.26, facing)
                );
                float sunLight = clamp(
                    dot(vShellCloudNormal, vShellCloudSunDirection),
                    0.0,
                    1.0
                );
                // Shadow offsets use object-space positions, so pass the object-space sun uniform.
                float lightShadow = shellCloudLightShadow(
                    vShellCloudPosition,
                    shellCloudTime,
                    shellCloudSunDirection
                );
                float forwardScatter = pow(
                    max(
                        dot(
                            vShellCloudSunDirection,
                            vShellCloudViewDirection
                        ),
                        0.0
                    ),
                    4.0
                );
                float cloudLight = clamp(
                    0.12
                        + sunLight * 0.70
                        + facing * 0.10
                        - lightShadow * 0.32
                        + forwardScatter * sunLight * (1.0 - facing) * 0.16,
                    0.0,
                    1.0
                );
                vec3 cloudColor = mix(
                    vec3(0.17, 0.23, 0.31),
                    vec3(0.96, 0.98, 1.0),
                    cloudLight
                );
                // 視線が浅いほど雲を長く通るが、雲のある場所だけに限定して輪郭リングを防ぐ。
                float pathLength = mix(
                    1.18,
                    0.88,
                    smoothstep(0.0, 0.52, facing)
                );
                float opticalDepth = cloudDensity * pathLength * 1.22;
                float alpha = (1.0 - exp(-opticalDepth))
                    * limbFade
                    * shellCloudOpacity
                    * shellCloudIntensity;
                // 雲の切れ目を本当に透明にして、下の地表を読めるようにする。
                if (alpha < 0.012) discard;
                gl_FragColor = vec4(cloudColor, min(alpha, 0.86));
            }
        `
    });
    material.customProgramCacheKey = () => SHELL_CLOUD_SHADER_VERSION;
    return material;
}

export function createShellPlanetClouds(
    THREE,
    radius,
    intensity = 1,
    sharedUniforms = null
) {
    const clouds = new THREE.Group();
    const uniforms = sharedUniforms || createShellCloudUniforms(THREE, intensity);
    uniforms.shellCloudIntensity.value = Math.max(
        0,
        Math.min(1, intensity)
    );

    // 二重の裏面シェルをやめ、輪郭リングではなく一枚の雲塊として読ませる。
    const cloudMesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.018, 48, 48),
        createCloudMaterial(THREE, uniforms, 0.86)
    );
    cloudMesh.renderOrder = 3;
    clouds.add(cloudMesh);
    clouds.userData.shellCloudUniforms = uniforms;
    return clouds;
}

export function updateShellPlanetClouds(clouds, nowMilliseconds) {
    const uniforms = clouds?.userData?.shellCloudUniforms;
    if (!uniforms) return;
    uniforms.shellCloudTime.value = (
        nowMilliseconds / 1000 % SHELL_CLOUD_CYCLE_SECONDS
    ) / SHELL_CLOUD_CYCLE_SECONDS;
}

