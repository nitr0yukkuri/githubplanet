const LUA_MOONLIGHT_CYCLE_SECONDS = 26;

export function isLuaPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'lua';
}

export function createLuaPlanetMaterial(THREE, planetTexture) {
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: planetTexture,
        aoMap: planetTexture,
        aoMapIntensity: 1.1,
        roughness: 0.88,
        metalness: 0.05
    });
    const uniforms = {
        luaMoonlightTime: { value: 0 }
    };

    material.userData.luaMoonlightUniforms = uniforms;
    material.userData.luaMoonlightStartMilliseconds = null;
    material.onBeforeCompile = (shader) => {
        shader.uniforms.luaMoonlightTime = uniforms.luaMoonlightTime;
        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                '#include <common>\nuniform float luaMoonlightTime;'
            )
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>
vec3 luaMarsTexture = diffuseColor.rgb;
float luaTerrainRelief = dot(luaMarsTexture, vec3(0.299, 0.587, 0.114));
float luaWhiteSurface = 0.62 + luaTerrainRelief * 0.32;
diffuseColor.rgb = vec3(luaWhiteSurface);
diffuseColor.a = 1.0;`
            );
    };
    material.customProgramCacheKey = () => 'lua-white-planet-moonlight-v1';
    return material;
}

function createMoonlightLayerMaterial(THREE, uniforms, opacity, side) {
    return new THREE.ShaderMaterial({
        uniforms: {
            luaMoonlightTime: uniforms.luaMoonlightTime,
            luaMoonlightOpacity: { value: opacity }
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        side,
        vertexShader: `
            varying vec3 vLuaMoonlightNormal;
            varying vec3 vLuaMoonlightViewDirection;
            varying vec3 vLuaMoonlightPosition;

            void main() {
                vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                vLuaMoonlightNormal = normalize(normalMatrix * normal);
                vLuaMoonlightViewDirection = normalize(-viewPosition.xyz);
                vLuaMoonlightPosition = normalize(position);
                gl_Position = projectionMatrix * viewPosition;
            }
        `,
        fragmentShader: `
            uniform float luaMoonlightTime;
            uniform float luaMoonlightOpacity;
            varying vec3 vLuaMoonlightNormal;
            varying vec3 vLuaMoonlightViewDirection;
            varying vec3 vLuaMoonlightPosition;

            void main() {
                float facing = abs(dot(
                    vLuaMoonlightNormal,
                    vLuaMoonlightViewDirection
                ));
                float rim = pow(1.0 - clamp(facing, 0.0, 1.0), 2.45);
                vec3 moonDirection = normalize(vec3(0.62, 0.35, 0.7));
                float darkSide = 1.0 - smoothstep(
                    -0.38,
                    0.44,
                    dot(vLuaMoonlightPosition, moonDirection)
                );
                float quietDrift = sin(
                    vLuaMoonlightPosition.y * 5.0
                    + vLuaMoonlightPosition.x * 2.5
                    + luaMoonlightTime * 6.28318530718
                ) * 0.5 + 0.5;
                float glow = rim * (0.28 + darkSide * 0.72)
                    * (0.9 + quietDrift * 0.1);
                float alpha = glow * luaMoonlightOpacity;
                if (alpha < 0.004) discard;
                gl_FragColor = vec4(vec3(1.0), alpha);
            }
        `
    });
}

export function createLuaPlanetMoonlight(THREE, radius, uniforms, intensity = 1) {
    const moonlight = new THREE.Group();
    const sharedUniforms = uniforms || { luaMoonlightTime: { value: 0 } };
    const safeIntensity = Math.max(0, Math.min(1, intensity));
    const layers = [
        { radiusScale: 1.045, opacity: 0.32, side: THREE.FrontSide },
        { radiusScale: 1.1, opacity: 0.14, side: THREE.BackSide }
    ];

    layers.forEach((layer, index) => {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(radius * layer.radiusScale, 48, 48),
            createMoonlightLayerMaterial(
                THREE,
                sharedUniforms,
                layer.opacity * safeIntensity,
                layer.side
            )
        );
        mesh.renderOrder = 5 + index;
        moonlight.add(mesh);
    });

    moonlight.userData.luaMoonlightUniforms = sharedUniforms;
    return moonlight;
}

export function updateLuaPlanetMoonlight(material, nowMilliseconds) {
    const uniforms = material?.userData?.luaMoonlightUniforms;
    if (!uniforms) return;
    if (material.userData.luaMoonlightStartMilliseconds === null) {
        material.userData.luaMoonlightStartMilliseconds = nowMilliseconds;
    }
    uniforms.luaMoonlightTime.value = (
        (nowMilliseconds - material.userData.luaMoonlightStartMilliseconds) / 1000
        % LUA_MOONLIGHT_CYCLE_SECONDS
    ) / LUA_MOONLIGHT_CYCLE_SECONDS;
}

