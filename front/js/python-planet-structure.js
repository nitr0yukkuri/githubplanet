const PYTHON_TRAIL_CYCLE_SECONDS = 9;
const PYTHON_TRAIL_MAX_FRAME_SECONDS = 0.08;
const PYTHON_TRAIL_ORBIT_SCALE = 1.34;
const PYTHON_TRAIL_TUBE_SCALE = 0.014;

export function isPythonPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'python';
}

export function createPythonPlanetMaterial(THREE, planetTexture) {
    // Pythonは地表に追加の線を重ねず、Marsテクスチャの起伏をそのまま見せる。
    return new THREE.MeshStandardMaterial({
        color: '#306998',
        map: planetTexture,
        aoMap: planetTexture,
        aoMapIntensity: 0.86,
        roughness: 0.86,
        metalness: 0.08
    });
}

function createPythonTrailCurve(THREE, radius, path, rotationAxis = 'y') {
    const points = path.map(([longitude, latitude]) => {
        const cosLatitude = Math.cos(latitude);
        const sinLatitude = Math.sin(latitude);
        const cosLongitude = Math.cos(longitude) * cosLatitude;
        const sinLongitude = Math.sin(longitude) * cosLatitude;
        const point = rotationAxis === 'z'
            ? new THREE.Vector3(cosLongitude, sinLongitude, sinLatitude)
            : new THREE.Vector3(cosLongitude, sinLatitude, sinLongitude);
        return point.multiplyScalar(radius * PYTHON_TRAIL_ORBIT_SCALE);
    });
    return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.35);
}

export function createPythonPlanetTrails(
    THREE,
    radius,
    intensity = 1,
    rotationAxis = 'y',
    direction = 1
) {
    const trails = new THREE.Group();
    const uniforms = {
        pythonTrailTime: { value: 0 },
        pythonTrailIntensity: { value: Math.max(0, Math.min(1, intensity)) }
    };
    const trailPaths = [
        [
            [-2.9, -0.22], [-2.05, 0.28], [-1.15, 0.48], [-0.25, 0.16],
            [0.65, -0.36], [1.5, -0.48], [2.35, -0.04], [3.0, 0.32]
        ],
        [
            [-2.8, 0.46], [-1.95, 0.05], [-1.05, -0.4], [-0.15, -0.2],
            [0.75, 0.32], [1.6, 0.44], [2.45, 0.06], [3.05, -0.3]
        ]
    ];
    const trailDirection = direction < 0 ? -1 : 1;

    trailPaths.forEach((path, index) => {
        // 2本は別の経路を通し、同じ速さと半周期差で対になる動きを保つ。
        const pairPhase = index === 0 ? 0 : 0.5;
        const material = new THREE.ShaderMaterial({
            uniforms: {
                pythonTrailTime: uniforms.pythonTrailTime,
                pythonTrailIntensity: uniforms.pythonTrailIntensity,
                pythonTrailPlanetRadius: { value: radius },
                pythonTrailOffset: { value: pairPhase },
                pythonTrailSpeed: { value: trailDirection },
                pythonTrailColor: {
                    value: new THREE.Color(index === 0 ? '#57b9ff' : '#ffd43b')
                }
            },
            transparent: true,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            vertexShader: `
                varying vec2 vPythonTrailUv;
                varying vec3 vPythonTrailWorldPosition;
                varying vec3 vPythonTrailWorldNormal;

                void main() {
                    vPythonTrailUv = uv;
                    vPythonTrailWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                    vPythonTrailWorldNormal = normalize(mat3(modelMatrix) * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float pythonTrailTime;
                uniform float pythonTrailIntensity;
                uniform float pythonTrailOffset;
                uniform float pythonTrailSpeed;
                uniform vec3 pythonTrailColor;
                varying vec2 vPythonTrailUv;
                varying vec3 vPythonTrailWorldPosition;
                varying vec3 vPythonTrailWorldNormal;

                void main() {
                    vec3 pythonTrailNormal = normalize(vPythonTrailWorldNormal);
                    vec3 pythonTrailLightDirection = normalize(vec3(0.38, 0.72, 0.58));
                    vec3 pythonTrailViewDirection = normalize(cameraPosition - vPythonTrailWorldPosition);
                    float pythonTrailDiffuse = max(
                        dot(pythonTrailNormal, pythonTrailLightDirection),
                        0.0
                    );
                    float pythonTrailFresnel = pow(
                        1.0 - max(dot(pythonTrailNormal, pythonTrailViewDirection), 0.0),
                        2.0
                    );
                    float pythonTrailVolume = 0.7 + pythonTrailDiffuse * 0.3
                        + pythonTrailFresnel * 0.35;
                    float pythonTrailFrontness = dot(
                        normalize(vPythonTrailWorldPosition),
                        normalize(cameraPosition)
                    );
                    // 惑星の奥側に回った軌跡は、薄く残さず完全に隠す。
                    float pythonTrailFrontnessFade = smoothstep(
                        -0.16,
                        0.24,
                        pythonTrailFrontness
                    );
                    float head = fract(pythonTrailTime * pythonTrailSpeed + pythonTrailOffset);
                    float behindHead = fract(head - vPythonTrailUv.x);
                    float tail = 1.0 - smoothstep(0.0, 0.22, behindHead);
                    float headGlow = 1.0 - smoothstep(0.0, 0.028, behindHead);
                    float tubeCenter = 1.0 - smoothstep(0.12, 0.5, abs(vPythonTrailUv.y - 0.5));
                    // 常に残る薄い線は作らず、移動する先端と尾だけを描く。
                    float pythonTrailBase = 0.0;
                    float pythonTrailMotion = tail * 0.42 + headGlow * 0.58;
                    float alpha = (pythonTrailBase + pythonTrailMotion)
                        * tubeCenter * pythonTrailIntensity * pythonTrailFrontnessFade;
                    if (alpha < 0.008) discard;
                    gl_FragColor = vec4(pythonTrailColor * pythonTrailVolume, alpha);
                }
            `
        });
        material.customProgramCacheKey = () => 'python-trail-distinct-pair-v9';
        const curve = createPythonTrailCurve(THREE, radius, path, rotationAxis);
        const trail = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 160, radius * PYTHON_TRAIL_TUBE_SCALE, 8, true),
            material
        );
        trail.renderOrder = 6 + index;
        trails.add(trail);
    });

    trails.userData.pythonTrailUniforms = uniforms;
    trails.userData.pythonTrailLastMilliseconds = null;
    return trails;
}

export function updatePythonPlanetTrails(trails, nowMilliseconds) {
    const uniforms = trails?.userData?.pythonTrailUniforms;
    if (!uniforms) return;
    const lastMilliseconds = trails.userData.pythonTrailLastMilliseconds;
    trails.userData.pythonTrailLastMilliseconds = nowMilliseconds;
    if (lastMilliseconds === null) return;
    const elapsedSeconds = Math.min(
        PYTHON_TRAIL_MAX_FRAME_SECONDS,
        Math.max(0, nowMilliseconds - lastMilliseconds) / 1000
    );
    uniforms.pythonTrailTime.value += elapsedSeconds / PYTHON_TRAIL_CYCLE_SECONDS;
}
