const KOTLIN_LIGHTNING_CYCLE_SECONDS = 6;
const TAU = Math.PI * 2;

export function isKotlinPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'kotlin';
}

export function createKotlinPlanetMaterial(THREE, planetTexture) {
    const material = new THREE.MeshStandardMaterial({
        color: '#A97BFF',
        map: planetTexture,
        aoMap: planetTexture,
        aoMapIntensity: 0.82,
        roughness: 0.24,
        metalness: 0.22,
        emissive: '#1b0b36',
        emissiveIntensity: 0.07
    });
    material.userData.kotlinSparkUniforms = {
        kotlinSparkTime: { value: 0 }
    };
    material.customProgramCacheKey = () => 'kotlin-planet-lightning-v1';
    return material;
}

function createKotlinLightningMaterial(THREE, uniforms, layer) {
    const isGlowLayer = layer === 'glow';
    const material = new THREE.ShaderMaterial({
        uniforms: {
            kotlinLightningTime: uniforms.kotlinSparkTime,
            kotlinLightningWidth: {
                value: isGlowLayer ? 0.075 : 0.016
            },
            kotlinLightningStrength: {
                value: isGlowLayer ? 0.9 : 1.45
            },
            kotlinLightningColor: {
                value: new THREE.Color(
                    isGlowLayer ? '#8b4bff' : '#fff5ff'
                )
            }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        vertexShader: `
            varying vec3 vKotlinLightningPosition;
            varying vec3 vKotlinLightningNormal;
            varying vec3 vKotlinLightningViewDirection;

            void main() {
                vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                vKotlinLightningPosition = normalize(position);
                vKotlinLightningNormal = normalize(normalMatrix * normal);
                vKotlinLightningViewDirection = normalize(-viewPosition.xyz);
                gl_Position = projectionMatrix * viewPosition;
            }
        `,
        fragmentShader: `
            uniform float kotlinLightningTime;
            uniform float kotlinLightningWidth;
            uniform float kotlinLightningStrength;
            uniform vec3 kotlinLightningColor;
            varying vec3 vKotlinLightningPosition;
            varying vec3 vKotlinLightningNormal;
            varying vec3 vKotlinLightningViewDirection;

            float kotlinLightningHash(float value) {
                return fract(sin(value * 127.1) * 43758.5453);
            }

            float kotlinLightningAngleDistance(float first, float second) {
                return abs(atan(sin(first - second), cos(first - second)));
            }

            void main() {
                vec3 surface = normalize(vKotlinLightningPosition);
                float facing = clamp(
                    dot(
                        vKotlinLightningNormal,
                        vKotlinLightningViewDirection
                    ),
                    0.0,
                    1.0
                );
                float projectedRadius = length(surface.xy);
                float angle = atan(surface.y, surface.x);
                float phase = kotlinLightningTime * ${TAU.toFixed(8)};
                float coreStrength = 0.0;
                float glowStrength = 0.0;
                float contactStrength = 0.0;

                // Keep the electricity at the silhouette: this is a corona,
                // not a set of lines painted across the planet's face.
                float edgeMask = smoothstep(0.58, 0.08, facing);
                float visibility = smoothstep(0.015, 0.3, facing);

                for (int index = 0; index < 6; index++) {
                    float current = float(index);
                    float seed = kotlinLightningHash(current * 17.31 + 4.2);
                    float anchor = -3.14159265
                        + current * 0.78539816
                        + (seed - 0.5) * 0.22;
                    float span = 0.08 + seed * 0.075;
                    float localAngle = kotlinLightningAngleDistance(
                        angle,
                        anchor
                    );
                    float routeMask = 1.0 - smoothstep(
                        span,
                        span + 0.045,
                        localAngle
                    );
                    float routeProgress = clamp(localAngle / span, 0.0, 1.0);
                    float crackleChunk = floor(routeProgress * 7.0);
                    float crackleBeat = floor(
                        kotlinLightningTime * 24.0 + seed * 13.0
                    );
                    float crackle = step(
                        0.48,
                        kotlinLightningHash(
                            crackleChunk * 31.0
                                + crackleBeat * 17.0
                                + current * 9.0
                        )
                    );
                    float zigzagA = abs(
                        fract(routeProgress * 5.0 + seed * 0.7) * 2.0 - 1.0
                    ) - 0.5;
                    float zigzagB = abs(
                        fract(routeProgress * 9.0 + seed * 1.1) * 2.0 - 1.0
                    ) - 0.5;
                    float pathRadius = 1.0 + zigzagA * 0.035
                        + zigzagB * 0.014;
                    float pathDistance = abs(projectedRadius - pathRadius);
                    float mainCore = 1.0 - smoothstep(
                        kotlinLightningWidth * 0.35,
                        kotlinLightningWidth,
                        pathDistance
                    );
                    float mainGlow = 1.0 - smoothstep(
                        kotlinLightningWidth,
                        kotlinLightningWidth * 3.0,
                        pathDistance
                    );

                    // The whole arc jitters like static; a separate hot spot
                    // travels only a short distance before snapping away.
                    float staticFlicker = 0.68 + 0.32 * sin(
                        phase * (11.0 + seed * 5.0) + current * 3.7
                    );
                    float sparkCenter = fract(
                        kotlinLightningTime * (0.7 + seed * 0.16)
                            + seed * 0.37
                    );
                    float spark = exp(
                        -pow((routeProgress - sparkCenter) / 0.16, 2.0)
                    );
                    float mainStrength = routeMask * staticFlicker
                        * crackle * (0.16 + spark * 1.15);

                    float branchStart = 0.38 + seed * 0.22;
                    float branchProgress = clamp(
                        (routeProgress - branchStart) / 0.28,
                        0.0,
                        1.0
                    );
                    float branchWindow = smoothstep(
                        branchStart,
                        branchStart + 0.06,
                        routeProgress
                    ) * (1.0 - smoothstep(
                        branchStart + 0.22,
                        branchStart + 0.3,
                        routeProgress
                    ));
                    float branchSign = seed < 0.5 ? -1.0 : 1.0;
                    float branchRadius = pathRadius
                        + branchSign * branchProgress * 0.12
                        + sin(
                            phase * 0.75 + current * 5.0
                                + routeProgress * 17.0
                        ) * 0.018 * branchProgress;
                    float branchDistance = abs(
                        projectedRadius - branchRadius
                    );
                    float branchCore = 1.0 - smoothstep(
                        kotlinLightningWidth * 0.3,
                        kotlinLightningWidth * 0.82,
                        branchDistance
                    );
                    float branchGlow = 1.0 - smoothstep(
                        kotlinLightningWidth * 0.9,
                        kotlinLightningWidth * 2.5,
                        branchDistance
                    );
                    float branchSpark = exp(
                        -pow((branchProgress - sparkCenter) / 0.18, 2.0)
                    );
                    float branchStrength = routeMask * branchWindow
                        * crackle * staticFlicker
                        * (0.12 + branchSpark * 1.1);

                    coreStrength += mainCore * mainStrength;
                    coreStrength += branchCore * branchStrength;
                    glowStrength += mainGlow * mainStrength;
                    glowStrength += branchGlow * branchStrength;
                    contactStrength += routeMask * branchWindow * crackle
                        * staticFlicker * 0.3;
                }

                float edgeHalo = pow(1.0 - facing, 3.3) * 0.12;
                float strength = min(
                    (coreStrength * 2.0 + glowStrength * 0.38
                        + contactStrength + edgeHalo)
                        * edgeMask * visibility,
                    1.0
                );
                if (strength < 0.012) discard;
                gl_FragColor = vec4(
                    kotlinLightningColor,
                    strength * kotlinLightningStrength
                );
            }
        `
    });
    material.customProgramCacheKey = () => (
        isGlowLayer
            ? 'kotlin-static-electric-glow-v1'
            : 'kotlin-static-electric-core-v1'
    );
    return material;
}

function kotlinSparkHash(value) {
    return (Math.sin(value * 127.1) * 43758.5453) % 1;
}

function createKotlinStaticSparkLines(THREE, radius, uniforms) {
    const positions = [];
    const seeds = [];
    const phases = [];
    const pointMasks = [];
    const routeCount = 4;
    const segmentCount = 4;
    const routeAngleOffsets = [-0.08, 0.12, -0.14, 0.06];
    const addSegment = (
        first,
        second,
        seed,
        phase,
        firstPointMask = 0,
        secondPointMask = 0
    ) => {
        positions.push(...first, ...second);
        seeds.push(seed, seed);
        phases.push(phase, phase);
        pointMasks.push(firstPointMask, secondPointMask);
    };

    for (let route = 0; route < routeCount; route += 1) {
        const seed = Math.abs(kotlinSparkHash(route * 17.3 + 2.1));
        // Stagger the strikes so only one discharge is active at a time.
        const phase = 0.22 + route / routeCount;
        const angle = (route / routeCount) * TAU
            + routeAngleOffsets[route]
            + (seed - 0.5) * 0.18;
        const normal = [Math.cos(angle), Math.sin(angle)];
        const tangent = [-Math.sin(angle), Math.cos(angle)];
        const length = radius * (0.15 + seed * 0.12);
        const turnDirection = seed < 0.5 ? -1 : 1;
        const turnAmount = radius * (0.055 + seed * 0.035);
        let previous = null;

        for (let segment = 0; segment <= segmentCount; segment += 1) {
            const progress = segment / segmentCount;
            const baseBend = (Math.abs(
                kotlinSparkHash(route * 41.9 + segment * 13.1 + 5.0)
            ) - 0.5) * radius * 0.025;
            const turnBend = progress >= 0.5
                ? turnDirection * turnAmount
                : 0;
            const bend = baseBend + turnBend;
            const radialDistance = radius * 1.018 + progress * length;
            const point = [
                normal[0] * radialDistance + tangent[0] * bend,
                normal[1] * radialDistance + tangent[1] * bend,
                radius * 0.18
            ];
            if (previous) {
                addSegment(
                    previous,
                    point,
                    seed,
                    phase,
                    0,
                    segment === 1 ? 1 : 0
                );
            }
            previous = point;

            if (segment === segmentCount) {
                const branchStart = point;
                const branchLength = radius * (0.07 + seed * 0.035);
                for (let branch = 0; branch < 2; branch += 1) {
                    const branchSign = branch === 0 ? -1 : 1;
                    const branchDirection = [
                        normal[0] * 0.42 + tangent[0] * branchSign * 0.9,
                        normal[1] * 0.42 + tangent[1] * branchSign * 0.9
                    ];
                    const branchMid = [
                        branchStart[0] + branchDirection[0] * branchLength * 0.5,
                        branchStart[1] + branchDirection[1] * branchLength * 0.5,
                        branchStart[2]
                    ];
                    const branchEnd = [
                        branchStart[0] + branchDirection[0] * branchLength,
                        branchStart[1] + branchDirection[1] * branchLength,
                        branchStart[2]
                    ];
                    addSegment(branchStart, branchMid, seed, phase);
                    addSegment(branchMid, branchEnd, seed, phase, 0, 1);
                }
            }
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute(
        'kotlinSparkSeed',
        new THREE.Float32BufferAttribute(seeds, 1)
    );
    geometry.setAttribute(
        'kotlinSparkPhase',
        new THREE.Float32BufferAttribute(phases, 1)
    );
    geometry.setAttribute(
        'kotlinSparkPointMask',
        new THREE.Float32BufferAttribute(pointMasks, 1)
    );
    const material = new THREE.ShaderMaterial({
        uniforms: {
            kotlinLightningTime: uniforms.kotlinSparkTime
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        vertexShader: `
            uniform float kotlinLightningTime;
            attribute float kotlinSparkSeed;
            attribute float kotlinSparkPhase;
            varying float vKotlinSparkAlpha;
            varying float vKotlinSparkEdge;

            float kotlinSparkShaderHash(float value) {
                return fract(sin(value * 127.1) * 43758.5453);
            }

            void main() {
                vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                vKotlinSparkEdge = 1.0;
                float strikePhase = fract(
                    kotlinLightningTime * 3.0
                        + kotlinSparkPhase
                );
                float attack = 1.0 - smoothstep(0.0, 0.045, strikePhase);
                float decay = 1.0 - smoothstep(0.045, 0.14, strikePhase);
                float zap = max(attack, decay * 0.12);
                float pulse = 0.5 + 0.5 * sin(
                    kotlinLightningTime * 41.0
                        + kotlinSparkSeed * 28.0
                );
                vKotlinSparkAlpha = zap * (0.18 + pulse * 3.2);
                gl_Position = projectionMatrix * viewPosition;
            }
        `,
        fragmentShader: `
            varying float vKotlinSparkAlpha;
            varying float vKotlinSparkEdge;
            void main() {
                float edge = vKotlinSparkEdge;
                if (vKotlinSparkAlpha < 0.025) discard;
                vec3 electricColor = mix(
                    vec3(0.52, 0.22, 1.0),
                    vec3(1.0, 0.9, 1.0),
                    vKotlinSparkAlpha
                );
                gl_FragColor = vec4(
                    electricColor,
                    vKotlinSparkAlpha * edge * 2.35
                );
            }
        `
    });
    material.customProgramCacheKey = () => 'kotlin-static-spark-lines-v6';
    const sparks = new THREE.LineSegments(geometry, material);
    sparks.renderOrder = 8;
    return sparks;
}

function createKotlinStaticSparkPoints(THREE, geometry, uniforms) {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            kotlinLightningTime: uniforms.kotlinSparkTime
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        vertexShader: `
            uniform float kotlinLightningTime;
            attribute float kotlinSparkSeed;
            attribute float kotlinSparkPhase;
            attribute float kotlinSparkPointMask;
            varying float vKotlinPointAlpha;
            varying float vKotlinPointEdge;

            float kotlinPointHash(float value) {
                return fract(sin(value * 127.1) * 43758.5453);
            }

            void main() {
                vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                vec3 viewNormal = normalize(normalMatrix * normalize(position));
                vec3 viewDirection = normalize(-viewPosition.xyz);
                float facing = clamp(dot(viewNormal, viewDirection), 0.0, 1.0);
                vKotlinPointEdge = 1.0 - smoothstep(0.22, 0.7, facing);
                float strikePhase = fract(
                    kotlinLightningTime * 3.0
                        + kotlinSparkPhase
                );
                        float attack = 1.0 - smoothstep(0.0, 0.08, strikePhase);
                        float decay = 1.0 - smoothstep(0.08, 0.24, strikePhase);
                        float zap = max(attack, decay * 0.22);
                float pulse = 0.5 + 0.5 * sin(
                    kotlinLightningTime * 41.0
                        + kotlinSparkSeed * 28.0
                );
                vKotlinPointAlpha = kotlinSparkPointMask * zap * (0.18 + pulse * 0.8);
                gl_PointSize = 1.5 + vKotlinPointAlpha * 2.5;
                gl_Position = projectionMatrix * viewPosition;
            }
        `,
        fragmentShader: `
            varying float vKotlinPointAlpha;
            varying float vKotlinPointEdge;
            void main() {
                vec2 point = gl_PointCoord - 0.5;
                float halo = 1.0 - smoothstep(0.12, 0.5, length(point));
                float edge = smoothstep(0.1, 0.5, vKotlinPointEdge);
                if (halo < 0.02 || vKotlinPointAlpha < 0.02 || edge < 0.02) discard;
                vec3 electricColor = mix(
                    vec3(0.48, 0.18, 1.0),
                    vec3(1.0, 0.92, 1.0),
                    vKotlinPointAlpha
                );
                gl_FragColor = vec4(
                    electricColor,
                    halo * vKotlinPointAlpha * edge * 0.7
                );
            }
        `
    });
    material.customProgramCacheKey = () => 'kotlin-static-spark-points-v5';
    geometry.setAttribute(
        'kotlinSparkPointMask',
        new THREE.Float32BufferAttribute(
            geometry.attributes.kotlinSparkPointMask.array.map((value, index) => (
                index % 2 === 1 ? value : 0
            )),
            1
        )
    );
    const points = new THREE.Points(geometry, material);
    points.renderOrder = 9;
    return points;
}

export function createKotlinElectricity(THREE, radius) {
    const electricity = new THREE.Group();
    const uniforms = {
        kotlinSparkTime: { value: 0 }
    };
    const sparkLines = createKotlinStaticSparkLines(
        THREE,
        radius,
        uniforms
    );
    electricity.add(sparkLines);
    electricity.add(
        createKotlinStaticSparkPoints(
            THREE,
            sparkLines.geometry,
            uniforms
        )
    );
    electricity.userData.kotlinElectricUniforms = uniforms;
    return electricity;
}

export function updateKotlinPlanetCrystal(target, nowMilliseconds) {
    const uniforms = target?.userData?.kotlinSparkUniforms;
    if (!uniforms?.kotlinSparkTime) return;
    uniforms.kotlinSparkTime.value = (
        nowMilliseconds / 1000 % KOTLIN_LIGHTNING_CYCLE_SECONDS
    ) / KOTLIN_LIGHTNING_CYCLE_SECONDS;
}

export function updateKotlinElectricity(target, nowMilliseconds) {
    const uniforms = target?.userData?.kotlinElectricUniforms;
    if (!uniforms?.kotlinSparkTime) return;
    const normalizedTime = (
        nowMilliseconds / 1000 % KOTLIN_LIGHTNING_CYCLE_SECONDS
    ) / KOTLIN_LIGHTNING_CYCLE_SECONDS;
    uniforms.kotlinSparkTime.value = normalizedTime;
    // Keep the ring locked to the silhouette. The crackle moves by
    // flickering and branching, so it never drifts across the planet face.
    target.rotation.y = 0;
    target.rotation.z = 0;
}
