const TYPESCRIPT_SHELL_CYCLE_SECONDS = 24;

export function isTypeScriptPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'typescript';
}

export function createTypeScriptPlanetMaterial(THREE, planetTexture) {
    const material = new THREE.MeshStandardMaterial({
        color: '#007acc',
        map: planetTexture,
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
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
#ifdef USE_MAP
vec3 tsMappedTexture = texture2D(map, vMapUv).rgb;
float tsTextureRelief = dot(tsMappedTexture, vec3(0.299, 0.587, 0.114));
float tsStructuredRelief = clamp(
    (tsTextureRelief - 0.5) * 1.55 + 0.5,
    0.0,
    1.0
);
vec3 tsDeepTerrain = vec3(0.018, 0.09, 0.18);
vec3 tsTypedTerrain = vec3(0.0, 0.36, 0.67);
vec3 tsRaisedTerrain = vec3(0.25, 0.64, 0.86);
vec3 tsTerrainColor = mix(tsDeepTerrain, tsTypedTerrain, tsStructuredRelief);
tsTerrainColor = mix(
    tsTerrainColor,
    tsRaisedTerrain,
    smoothstep(0.62, 0.9, tsTextureRelief) * 0.34
);
tsTerrainColor *= 0.72 + tsTextureRelief * 0.46;
diffuseColor.rgb = tsTerrainColor;
#endif`
        );
    };
    material.customProgramCacheKey = () => 'typescript-planet-textured-surface-v5-mapped';
    return material;
}

function createShellLayerMaterial(THREE, sharedUniforms, layer) {
    return new THREE.ShaderMaterial({
        uniforms: {
            tsShellTime: sharedUniforms.tsShellTime,
            tsShellColor: { value: new THREE.Color(layer.color) },
            tsShellLayer: { value: layer.kind },
            tsShellOpacity: { value: layer.opacity },
            tsShellFrontLayer: { value: layer.front ? 1 : 0 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: layer.front ? THREE.FrontSide : THREE.BackSide,
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
            uniform float tsShellFrontLayer;
            varying vec3 vTsShellNormal;
            varying vec3 vTsShellViewDirection;
            varying vec3 vTsShellPosition;

            float tsShellHash(vec2 value) {
                return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
            }

            void main() {
                float phase = tsShellTime * 6.28318530718;
                vec3 shellPosition = normalize(vTsShellPosition);
                float facing = clamp(dot(vTsShellViewDirection, vTsShellNormal), 0.0, 1.0);
                float rim = pow(1.0 - facing, mix(1.9, 2.65, tsShellLayer * 0.5));

                vec3 shellAxis = normalize(vec3(0.3, 0.88, 0.36));
                vec3 shellBasisX = normalize(cross(shellAxis, vec3(0.0, 0.0, 1.0)));
                vec3 shellBasisY = normalize(cross(shellAxis, shellBasisX));
                float longitude = atan(
                    dot(shellPosition, shellBasisY),
                    dot(shellPosition, shellBasisX)
                );
                float latitude = dot(shellPosition, shellAxis);
                float travel = longitude * 2.4 + latitude * 3.8
                    - phase + tsShellLayer * 1.7;
                float broadGuard = sin(travel * 2.0 + sin(latitude * 8.0) * 0.42)
                    * 0.5 + 0.5;
                broadGuard = smoothstep(0.22, 0.9, broadGuard);
                float brokenBoundary = sin(travel * 5.0 - latitude * 17.0 + 1.4)
                    * 0.5 + 0.5;
                brokenBoundary = pow(smoothstep(0.58, 0.96, brokenBoundary), 3.0);
                float validationFilament = sin(
                    travel * 9.0 + latitude * 29.0
                    + sin(longitude * 7.0 - phase) * 0.65
                ) * 0.5 + 0.5;
                validationFilament = pow(
                    smoothstep(0.66, 0.97, validationFilament),
                    4.0
                );
                float cellGuard = tsShellHash(floor(vec2(
                    longitude * 18.0 + tsShellLayer * 3.0,
                    latitude * 31.0 + tsShellLayer * 5.0
                )));
                float coarseGuard = tsShellHash(floor(vec2(
                    longitude * 8.0 + tsShellLayer * 2.0,
                    latitude * 15.0
                )));
                float guardedNode = smoothstep(0.52, 0.92, cellGuard)
                    * max(brokenBoundary, validationFilament * 0.78);
                float stableRegion = smoothstep(0.3, 0.82, coarseGuard);
                float latitudeFade = 1.0 - smoothstep(0.74, 1.0, abs(latitude));
                float typedField = broadGuard * stableRegion;
                float quietBreath = 0.94 + sin(phase) * 0.06;
                float innerLayer = typedField * 0.18 + brokenBoundary * 0.12;
                float structureLayer = typedField * 0.34
                    + brokenBoundary * 0.28
                    + validationFilament * 0.38
                    + guardedNode * 0.2;
                float outerLayer = typedField * 0.22
                    + brokenBoundary * 0.2
                    + validationFilament * 0.3
                    + guardedNode * 0.14;
                float layerPattern = mix(
                    innerLayer,
                    mix(structureLayer, outerLayer, step(1.5, tsShellLayer)),
                    step(0.5, tsShellLayer)
                );
                float continuousGuard = mix(0.22, 0.1, tsShellLayer * 0.5);
                float outerLayerStrength = rim * latitudeFade
                    * (continuousGuard + layerPattern) * quietBreath;
                float frontLayerStrength = facing * latitudeFade
                    * (0.08 + typedField * 0.18
                        + brokenBoundary * 0.18
                        + validationFilament * 0.22
                        + guardedNode * 0.16)
                    * quietBreath;
                float layerStrength = mix(
                    outerLayerStrength,
                    frontLayerStrength,
                    tsShellFrontLayer
                );
                float alpha = min(layerStrength * tsShellOpacity, 0.62);
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
        { radiusScale: 1.035, color: '#42a5e8', kind: 0, opacity: 0.36, front: true },
        { radiusScale: 1.08, color: '#007acc', kind: 0, opacity: 0.42 },
        { radiusScale: 1.125, color: '#258fd4', kind: 1, opacity: 0.34 },
        { radiusScale: 1.165, color: '#62b8eb', kind: 2, opacity: 0.22 }
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
