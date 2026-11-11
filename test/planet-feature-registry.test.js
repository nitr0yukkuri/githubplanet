import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createPlanetFeatureRuntime,
    planetFeatures,
    resolvePlanetFeature
} from '../front/js/planet-features/registry.js';

test('registers every language feature behind one frontend boundary', () => {
    assert.deepEqual(
        planetFeatures.map((feature) => feature.id),
        [
            'c', 'css', 'cpp', 'elm', 'go', 'shell', 'swift', 'vue',
            'typescript', 'javascript', 'java', 'kotlin', 'perl', 'rust', 'ruby', 'python'
        ]
    );

    for (const feature of planetFeatures) {
        assert.equal(typeof feature.matches, 'function', feature.id);
        assert.equal(typeof feature.createMaterial, 'function', feature.id);
        if (feature.update) assert.equal(typeof feature.update, 'function', feature.id);
    }
});

test('resolves exact language features without cross-matching', () => {
    assert.equal(resolvePlanetFeature({ mainLanguage: ' java ' }).id, 'java');
    assert.equal(resolvePlanetFeature({ mainLanguage: 'Kotlin' }).id, 'kotlin');
    assert.equal(resolvePlanetFeature({ mainLanguage: ' elm ' }).id, 'elm');
    assert.equal(resolvePlanetFeature({ mainLanguage: ' lua ' }), null);
    assert.equal(resolvePlanetFeature({ mainLanguage: ' Perl ' }).id, 'perl');
    assert.equal(resolvePlanetFeature({ mainLanguage: 'C++' }).id, 'cpp');
    assert.equal(resolvePlanetFeature({ mainLanguage: 'JavaScript' }).id, 'javascript');
    assert.equal(resolvePlanetFeature({ mainLanguage: ' Python ' }).id, 'python');
    assert.equal(resolvePlanetFeature({ mainLanguage: ' Shell ' }).id, 'shell');
    assert.equal(resolvePlanetFeature({ mainLanguage: 'Bash' }), null);
    assert.equal(resolvePlanetFeature({ mainLanguage: 'Unknown' }), null);
});

test('calculates wind speed only for wind-based planet features', () => {
    assert.deepEqual(
        planetFeatures.filter((feature) => feature.usesWindSpeed).map((feature) => feature.id),
        ['go', 'swift', 'vue']
    );
});

class FakeColor {
    constructor(value) { this.value = value; }
    set(value) { this.value = value; return this; }
    setHSL() { return this; }
    getHexString() { return '808080'; }
}

class FakeGroup {
    constructor() { this.children = []; }
    add(child) { this.children.push(child); }
}

class FakeVector3 {
    constructor(...values) { this.values = values; }
    multiplyScalar(scale) {
        this.values = this.values.map((value) => value * scale);
        return this;
    }
}

class FakeMaterial {
    constructor(options) { Object.assign(this, options); }
    dispose() { this.disposed = true; }
}

class FakeMesh {
    constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
        this.userData = {};
    }
}

class FakeCurve {
    constructor(points) { this.points = points; }
}

class FakeTubeGeometry {
    constructor(...args) { this.args = args; }
    dispose() { this.disposed = true; }
}

test('shares secondary language trails with Python and updates historical ranks in place', () => {
    const THREE = {
        AdditiveBlending: 'additive',
        CatmullRomCurve3: FakeCurve,
        Color: FakeColor,
        DoubleSide: 'double',
        Group: FakeGroup,
        Mesh: FakeMesh,
        MeshStandardMaterial: FakeMaterial,
        ShaderMaterial: FakeMaterial,
        TubeGeometry: FakeTubeGeometry,
        Vector3: FakeVector3
    };
    const runtime = createPlanetFeatureRuntime({
        THREE,
        planetTexture: { id: 'mars' },
        data: {
            mainLanguage: 'Python',
            languageStats: { Python: 70, Rust: 20, TypeScript: 10 }
        },
        radius: 4,
        direction: -1
    });
    const trailGroup = runtime.sceneObjects[0];
    const [second, third] = trailGroup.children;
    const secondGeometry = second.geometry;

    assert.equal(runtime.id, 'python');
    assert.equal(runtime.sceneObjects.length, 1);
    assert.deepEqual([second.userData.language, third.userData.language], ['Rust', 'TypeScript']);
    assert.deepEqual([
        second.material.uniforms.trailSpeed.value,
        third.material.uniforms.trailSpeed.value
    ], [1, 1]);

    runtime.setLanguageComposition({
        mainLanguage: 'Python',
        languageStats: { Python: 70, Go: 35, Rust: 10 }
    });

    assert.deepEqual([second.userData.language, third.userData.language], ['Go', 'Rust']);
    assert.equal(second.geometry, secondGeometry);
    assert.notEqual(second.material.uniforms.trailColor.value.value, '#dea584');
    assert.equal(second.material.uniforms.trailWidthDelta.value !== 0, true);
});


test('disposes GPU resources for shared language trails', () => {
    const THREE = {
        AdditiveBlending: 'additive',
        CatmullRomCurve3: FakeCurve,
        Color: FakeColor,
        DoubleSide: 'double',
        Group: FakeGroup,
        Mesh: FakeMesh,
        MeshStandardMaterial: FakeMaterial,
        ShaderMaterial: FakeMaterial,
        TubeGeometry: FakeTubeGeometry,
        Vector3: FakeVector3
    };
    const runtime = createPlanetFeatureRuntime({
        THREE,
        planetTexture: { id: 'mars' },
        data: { mainLanguage: 'Unknown', languageStats: { Unknown: 70, Rust: 20, Go: 10 } },
        radius: 4
    });
    const tracks = runtime.sceneObjects[0].children.slice();

    runtime.dispose();

    assert.equal(tracks.length, 2);
    assert.ok(tracks.every(({ geometry, material }) => geometry.disposed && material.disposed));
});
