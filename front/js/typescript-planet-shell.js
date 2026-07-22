const TYPESCRIPT_SHELL_CYCLE_SECONDS = 24;

export function isTypeScriptPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'typescript';
}

export function createTypeScriptPlanetMaterial(THREE, planetTexture) {
    const material = new THREE.MeshStandardMaterial({
        color: '#007acc',
        aoMap: planetTexture,
        aoMapIntensity: 1.5,
        roughness: 0.8,
        metalness: 0.2
    });
    const narrowingUniforms = {
        tsNarrowingTime: { value: 0 }
    };

    material.userData.tsNarrowingUniforms = narrowingUniforms;
    material.onBeforeCompile = (shader) => {
        shader.uniforms.tsNarrowingTime = narrowingUniforms.tsNarrowingTime;
        shader.vertexShader = shader.vertexShader
            .replace(
                'void main() {',
                `varying vec3 vTsNarrowingPosition;

                void main() {`
            )
            .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                vTsNarrowingPosition = normalize(position);`
            );
        shader.fragmentShader = shader.fragmentShader
            .replace(
                'void main() {',
                `uniform float tsNarrowingTime;
                varying vec3 vTsNarrowingPosition;

                void main() {`
            )
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>
                float tsPhase = tsNarrowingTime * 6.28318530718;
                float tsFocus = pow(max(sin(tsPhase), 0.0), 2.0);
                vec3 tsPosition = normalize(vTsNarrowingPosition);
                vec3 tsDirection = normalize(vec3(0.62, 0.47, 0.63));
                float tsField = dot(tsPosition, tsDirection);
                float tsWidth = mix(0.3, 0.055, tsFocus);
                float tsDistance = abs(tsField - 0.12);
                float tsCandidate = 1.0 - smoothstep(
                    tsWidth,
                    tsWidth + 0.11,
                    tsDistance
                );
                float tsCandidateLight = tsCandidate * (1.0 - tsFocus) * 0.1;
                vec3 tsNarrowingColor = vec3(0.38, 0.78, 1.0);
                diffuseColor.rgb = mix(
                    diffuseColor.rgb,
                    tsNarrowingColor,
                    tsCandidateLight
                );`
            );
    };
    material.customProgramCacheKey = () => 'typescript-planet-type-narrowing-v2';
    return material;
}

function createShellLayerMaterial(THREE, sharedUniforms, layer) {
    return new THREE.ShaderMaterial({
        uniforms: {
            tsShellTime: sharedUniforms.tsShellTime,
            tsShellColor: { value: new THREE.Color(layer.color) },
            tsShellLayer: { value: layer.kind },
            tsShellOpacity: { value: layer.opacity }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        vertexShader: `
            varying vec3 vTsShellNormal;
            varying vec3 vTsShellViewDirection;
            varying vec3 vTsShellPosition;

            void main() {
                vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                vTsShellNormal = normalize(normalMatrix * normal);
                vTsShellViewDirection = normalize(-viewPosition.xyz);
                vTsShellPosition = normalize(position);
                gl_Position = projectionMatrix * viewPosition;
            }
        `,
        fragmentShader: `
            uniform float tsShellTime;
            uniform vec3 tsShellColor;
            uniform float tsShellLayer;
            uniform float tsShellOpacity;
            varying vec3 vTsShellNormal;
            varying vec3 vTsShellViewDirection;
            varying vec3 vTsShellPosition;

            float tsBoundary(float field, float center) {
                return 1.0 - smoothstep(0.035, 0.105, abs(field - center));
            }

            void main() {
                float phase = tsShellTime * 6.28318530718;
                vec3 shellPosition = normalize(vTsShellPosition);
                float facing = clamp(dot(vTsShellViewDirection, vTsShellNormal), 0.0, 1.0);
                float rim = pow(1.0 - facing, mix(2.0, 3.1, tsShellLayer * 0.5));

                vec3 directionA = normalize(vec3(0.72, 0.44, -0.53));
                vec3 directionB = normalize(vec3(-0.38, 0.81, 0.45));
                vec3 directionC = normalize(vec3(0.22, -0.51, 0.83));
                float fieldA = dot(shellPosition, directionA);
                float fieldB = dot(shellPosition, directionB);
                float fieldC = dot(shellPosition, directionC);

                float boundaryA = tsBoundary(fieldA, 0.16)
                    * smoothstep(-0.48, 0.25, fieldB);
                float boundaryB = tsBoundary(fieldB, -0.12)
                    * smoothstep(-0.56, 0.34, fieldC);
                float boundaryC = tsBoundary(fieldC, 0.24)
                    * smoothstep(-0.52, 0.3, fieldA);
                float fixedStructure = clamp(max(boundaryA, max(boundaryB, boundaryC)), 0.0, 1.0);
                float junction = clamp(
                    boundaryA * boundaryB
                    + boundaryB * boundaryC
                    + boundaryC * boundaryA,
                    0.0,
                    1.0
                );

                float zoneA = smoothstep(0.52, 0.78, fieldA)
                    * smoothstep(-0.25, 0.28, fieldB);
                float zoneB = smoothstep(0.5, 0.76, fieldB)
                    * smoothstep(-0.3, 0.22, fieldC);
                float zoneC = smoothstep(0.52, 0.8, fieldC)
                    * smoothstep(-0.28, 0.26, fieldA);
                float validationA = pow(max(sin(phase), 0.0), 4.0) * zoneA;
                float validationB = pow(max(sin(phase - 2.09439510239), 0.0), 4.0) * zoneB;
                float validationC = pow(max(sin(phase - 4.18879020479), 0.0), 4.0) * zoneC;
                float validation = clamp(validationA + validationB + validationC, 0.0, 1.0);
                float quietBreath = 0.94 + sin(phase) * 0.06;

                float innerLayer = rim * (0.48 + quietBreath * 0.18);
                float structureLayer = rim * (
                    0.22 + fixedStructure * 0.96 + junction * 0.72 + validation * 0.46
                );
                float outerLayer = rim * (
                    0.14 + fixedStructure * 0.38 + junction * 0.48 + validation * 0.88
                );
                float typedGuardRim = pow(1.0 - facing, 7.0);
                float typedGuard = typedGuardRim * (
                    fixedStructure * 0.3 + junction * 0.24
                ) * (0.72 + validation * 0.28);
                float guardedStructureLayer = structureLayer + typedGuard;
                float guardedOuterLayer = outerLayer + typedGuard * 0.42;
                float layerStrength = mix(
                    innerLayer,
                    mix(
                        guardedStructureLayer,
                        guardedOuterLayer,
                        step(1.5, tsShellLayer)
                    ),
                    step(0.5, tsShellLayer)
                );
                float alpha = min(layerStrength * tsShellOpacity, 0.68);
                gl_FragColor = vec4(tsShellColor, alpha);
            }
        `
    });
}

export function createTypeScriptPlanetShell(THREE, radius) {
    const shell = new THREE.Group();
    const sharedUniforms = {
        tsShellTime: { value: 0 }
    };
    const layers = [
        { radiusScale: 1.08, color: '#007acc', kind: 0, opacity: 0.29 },
        { radiusScale: 1.125, color: '#258fd4', kind: 1, opacity: 0.25 },
        { radiusScale: 1.165, color: '#62b8eb', kind: 2, opacity: 0.14 }
    ];

    layers.forEach((layer, index) => {
        const material = createShellLayerMaterial(THREE, sharedUniforms, layer);
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(radius * layer.radiusScale, 48, 48),
            material
        );
        mesh.renderOrder = 2 + index;
        shell.add(mesh);
    });

    shell.userData.tsShellUniforms = sharedUniforms;
    return shell;
}

export function updateTypeScriptPlanetShell(target, nowMilliseconds) {
    const normalizedTime = (
        nowMilliseconds / 1000 % TYPESCRIPT_SHELL_CYCLE_SECONDS
    ) / TYPESCRIPT_SHELL_CYCLE_SECONDS;
    const shellUniforms = target?.userData?.tsShellUniforms;
    const narrowingUniforms = target?.userData?.tsNarrowingUniforms;
    if (shellUniforms) shellUniforms.tsShellTime.value = normalizedTime;
    if (narrowingUniforms) narrowingUniforms.tsNarrowingTime.value = normalizedTime;
}
