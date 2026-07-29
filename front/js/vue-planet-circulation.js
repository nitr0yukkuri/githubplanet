export function isVuePlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'vue';
}

const INITIAL_VUE_LEAF_PHASE_SECONDS = 0.3;

export function createVueLeafWind(THREE, radius) {
    const leafSeeds = new Float32Array([
        0.08, 0.14, 0.31, 0.47, 0.71, 0.9
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    geometry.setAttribute('leafSeed', new THREE.BufferAttribute(leafSeeds, 1));

    const uniforms = {
        vueLeafTime: { value: INITIAL_VUE_LEAF_PHASE_SECONDS },
        vueLeafRadius: { value: radius * 1.075 }
    };
    const material = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        vertexShader: `
            uniform float vueLeafTime;
            uniform float vueLeafRadius;
            attribute float leafSeed;
            varying float vLeafSeed;
            varying float vLeafFade;
            void main() {
                float angle = leafSeed * 6.2831853 + vueLeafTime * (0.34 + leafSeed * 0.16);
                float latitude = sin(leafSeed * 17.0 + 0.7) * 0.42;
                vec3 orbitPosition = vec3(
                    cos(angle) * cos(latitude),
                    sin(latitude),
                    sin(angle) * cos(latitude)
                ) * vueLeafRadius;
                vec4 viewPosition = modelViewMatrix * vec4(orbitPosition, 1.0);
                gl_Position = projectionMatrix * viewPosition;
                gl_PointSize = (5.2 + leafSeed * 2.8) * (30.0 / max(1.0, -viewPosition.z));
                vLeafSeed = leafSeed;
                vLeafFade = smoothstep(-0.45, 0.15, sin(angle));
            }
        `,
        fragmentShader: `
            varying float vLeafSeed;
            varying float vLeafFade;
            void main() {
                vec2 point = gl_PointCoord - 0.5;
                float turn = vLeafSeed * 5.4;
                mat2 rotation = mat2(cos(turn), -sin(turn), sin(turn), cos(turn));
                point = rotation * point;
                float leafShape = 1.0 - smoothstep(0.36, 0.48,
                    abs(point.x) * 1.45 + point.y * point.y * 2.4
                );
                float vein = 1.0 - smoothstep(0.015, 0.045, abs(point.x));
                vec3 leafColor = mix(vec3(0.08, 0.34, 0.18), vec3(0.42, 0.72, 0.3), vLeafSeed);
                leafColor = mix(leafColor, vec3(0.62, 0.78, 0.38), vein * 0.2);
                gl_FragColor = vec4(leafColor, leafShape * vLeafFade * 0.88);
            }
        `
    });
    const leaves = new THREE.Points(geometry, material);
    leaves.renderOrder = 4;
    leaves.userData.vueLeafUniforms = uniforms;
    leaves.userData.vueLeafLastMilliseconds = null;
    return leaves;
}

export function updateVueLeafWind(leaves, nowMilliseconds, speedFactor = 1) {
    const uniforms = leaves?.userData?.vueLeafUniforms;
    if (!uniforms) return;
    const lastMilliseconds = leaves.userData.vueLeafLastMilliseconds;
    leaves.userData.vueLeafLastMilliseconds = nowMilliseconds;
    if (lastMilliseconds === null) return;
    const elapsedSeconds = Math.max(0, nowMilliseconds - lastMilliseconds) / 1000;
    uniforms.vueLeafTime.value += elapsedSeconds * Math.max(0, speedFactor);
}
