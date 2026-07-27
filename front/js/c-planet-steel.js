export function isCPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'c';
}

export function createCPlanetSteelMaterial(THREE, planetTexture) {
    const material = new THREE.MeshStandardMaterial({
        color: '#74787c',
        aoMap: planetTexture,
        aoMapIntensity: 0.72,
        roughness: 0.7,
        metalness: 0.34,
        emissive: new THREE.Color('#171a1d'),
        emissiveIntensity: 0.28
    });

    material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `#include <dithering_fragment>
float cSteelFacing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
float cSteelRim = pow(1.0 - cSteelFacing, 5.0);
gl_FragColor.rgb += vec3(0.42, 0.46, 0.5) * cSteelRim * 0.16;`
        );
    };
    material.customProgramCacheKey = () => 'c-planet-charcoal-steel-v1';

    return material;
}
