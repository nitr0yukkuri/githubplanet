export function createWebGLRenderer(THREE, options) {
    if (typeof THREE?.WebGLRenderer !== 'function') return null;
    try {
        return new THREE.WebGLRenderer(options);
    } catch {
        return null;
    }
}
