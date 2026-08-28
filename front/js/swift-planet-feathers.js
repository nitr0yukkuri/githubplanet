const INITIAL_SWIFT_FEATHER_PHASE_SECONDS = 0.65;
const SWIFT_FEATHER_SEEDS = [0.08, 0.27, 0.46, 0.68, 0.89];

export function isSwiftPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'swift';
}

export function createSwiftPlanetFeathers(THREE, radius, flowDirection = 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SWIFT_FEATHER_SEEDS.length * 3), 3));
    geometry.setAttribute('featherSeed', new THREE.BufferAttribute(new Float32Array(SWIFT_FEATHER_SEEDS), 1));

    const uniforms = {
        swiftFeatherTime: { value: INITIAL_SWIFT_FEATHER_PHASE_SECONDS },
        swiftFeatherRadius: { value: radius * 1.225 },
        swiftWindDirection: { value: flowDirection < 0 ? -1 : 1 }
    };
    const material = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        vertexShader: `
            uniform float swiftFeatherTime;
            uniform float swiftFeatherRadius;
            uniform float swiftWindDirection;
            attribute float featherSeed;
            varying float vFeatherSeed;
            varying float vFeatherAlpha;

            void main() {
                vec3 windAxis = normalize(vec3(0.28, 0.91, 0.31));
                vec3 windBasisX = normalize(cross(windAxis, vec3(0.0, 0.0, 1.0)));
                vec3 windBasisY = normalize(cross(windAxis, windBasisX));
                float angle = featherSeed * 6.2831853
                    + swiftFeatherTime * (1.28 + featherSeed * 0.22) * swiftWindDirection;
                float latitude = sin(featherSeed * 17.0 + 0.7) * 0.34
                    + cos(swiftFeatherTime * 0.34 + featherSeed * 6.0) * 0.045;
                float radialMotion = sin(swiftFeatherTime * 0.82 + featherSeed * 8.0) * 0.024;
                vec3 orbitPosition = (
                    windBasisX * cos(angle) * cos(latitude)
                    + windBasisY * sin(angle) * cos(latitude)
                    + windAxis * sin(latitude)
                ) * swiftFeatherRadius * (1.0 + radialMotion);
                vec4 viewPosition = modelViewMatrix * vec4(orbitPosition, 1.0);
                gl_Position = projectionMatrix * viewPosition;
                gl_PointSize = (5.8 + featherSeed * 2.4) * (36.0 / max(1.0, -viewPosition.z));
                vFeatherSeed = featherSeed;
                vFeatherAlpha = 0.64 + sin(angle * 1.7) * 0.07;
            }
        `,
        fragmentShader: `
            varying float vFeatherSeed;
            varying float vFeatherAlpha;

            void main() {
                vec2 point = gl_PointCoord - 0.5;
                float turn = vFeatherSeed * 5.4 + 0.45;
                mat2 rotation = mat2(cos(turn), -sin(turn), sin(turn), cos(turn));
                point = rotation * point;

                float lowerTaper = smoothstep(-0.5, -0.24, point.y);
                float upperTaper = 1.0 - smoothstep(0.1, 0.5, point.y);
                float featherSpine = point.y * 0.08;
                float featherWidth = 0.025 + lowerTaper * upperTaper * 0.22;
                float featherShape = 1.0 - smoothstep(-0.015, 0.045,
                    abs(point.x - featherSpine) - featherWidth
                );
                float shaft = 1.0 - smoothstep(0.014, 0.038, abs(point.x));
                vec3 featherColor = mix(
                    vec3(0.72, 0.018, 0.01),
                    vec3(1.0, 0.16, 0.04),
                    vFeatherSeed * 0.38
                );
                featherColor = mix(featherColor, vec3(1.0, 0.38, 0.12), shaft * 0.24);
                float alpha = featherShape * vFeatherAlpha;
                if (alpha < 0.01) discard;
                gl_FragColor = vec4(featherColor, alpha);
            }
        `
    });
    const feathers = new THREE.Points(geometry, material);
    feathers.renderOrder = 4;
    feathers.userData.swiftFeatherUniforms = uniforms;
    feathers.userData.swiftFeatherLastMilliseconds = null;
    return feathers;
}

export function updateSwiftPlanetFeathers(feathers, nowMilliseconds, speedFactor = 1) {
    const uniforms = feathers?.userData?.swiftFeatherUniforms;
    if (!uniforms) return;
    const lastMilliseconds = feathers.userData.swiftFeatherLastMilliseconds;
    feathers.userData.swiftFeatherLastMilliseconds = nowMilliseconds;
    if (lastMilliseconds === null) return;
    const elapsedSeconds = Math.max(0, nowMilliseconds - lastMilliseconds) / 1000;
    uniforms.swiftFeatherTime.value += elapsedSeconds * Math.max(0, speedFactor);
}
