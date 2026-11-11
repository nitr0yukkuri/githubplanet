export function isPythonPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'python';
}

export function createPythonPlanetMaterial(THREE, planetTexture) {
    // Pythonの表面はMars地形を保ち、2位・3位言語の軌跡は共通ランタイムへ委ねる。
    return new THREE.MeshStandardMaterial({
        color: '#306998',
        map: planetTexture,
        aoMap: planetTexture,
        aoMapIntensity: 0.86,
        roughness: 0.86,
        metalness: 0.08
    });
}
