import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createPythonPlanetMaterial,
    createPythonPlanetTrails,
    isPythonPlanet,
    updatePythonPlanetTrails
} from '../front/js/python-planet-structure.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
        this.userData = {};
    }
}

class FakeGroup {
    constructor() {
        this.children = [];
        this.userData = {};
    }

    add(child) {
        this.children.push(child);
    }
}

class FakeObject {
    constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
    }
}

class FakeVector3 {
    constructor(x, y, z) {
        this.values = [x, y, z];
    }

    multiplyScalar(scale) {
        this.values = this.values.map((value) => value * scale);
        return this;
    }
}

class FakeCurve {
    constructor(points, closed) {
        this.points = points;
        this.closed = closed;
    }
}

class FakeTubeGeometry {
    constructor(...args) {
        this.args = args;
    }
}

class FakeColor {
    constructor(value) {
        this.value = value;
    }
}

const THREE = {
    AdditiveBlending: 'additive',
    CatmullRomCurve3: FakeCurve,
    Color: FakeColor,
    DoubleSide: 'double',
    Group: FakeGroup,
    Mesh: FakeObject,
    MeshStandardMaterial: FakeMaterial,
    ShaderMaterial: FakeMaterial,
    TubeGeometry: FakeTubeGeometry,
    Vector3: FakeVector3
};

test('matches only normalized Python planets', () => {
    assert.equal(isPythonPlanet({ mainLanguage: 'Python' }), true);
    assert.equal(isPythonPlanet({ mainLanguage: ' python ' }), true);
    assert.equal(isPythonPlanet({ mainLanguage: 'TypeScript' }), false);
    assert.equal(isPythonPlanet({ mainLanguage: 'Jupyter Notebook' }), false);
});

test('uses the Mars texture without adding a procedural surface overlay', () => {
    const texture = { id: 'mars-terrain' };
    const material = createPythonPlanetMaterial(THREE, texture);

    assert.equal(material.color, '#306998');
    assert.equal(material.map, texture);
    assert.equal(material.aoMap, texture);
    assert.equal(material.aoMapIntensity, 0.86);
    assert.equal(material.roughness, 0.86);
    assert.equal(material.metalness, 0.08);
});

test('keeps two distinct moving trails with no persistent base line', () => {
    const trails = createPythonPlanetTrails(THREE, 4, 0.6);

    assert.equal(trails.children.length, 2);
    assert.ok(trails.children.every(({ geometry }) => geometry.args[0].closed));
    assert.equal(trails.children[0].geometry.args[3], 8);
    assert.ok(trails.children[0].geometry.args[2] > 4 * 0.01);
    assert.ok(trails.children.every(({ material }) => material.depthTest));
    assert.equal(trails.children[1].material.uniforms.pythonTrailColor.value.value, '#ffd43b');
    assert.equal(trails.children[0].material.uniforms.pythonTrailSpeed.value, 1);
    assert.equal(trails.children[1].material.uniforms.pythonTrailSpeed.value, 1);
    assert.equal(trails.children[1].material.uniforms.pythonTrailOffset.value, 0.5);
    assert.notDeepEqual(
        trails.children[0].geometry.args[0].points.map(({ values }) => values),
        trails.children[1].geometry.args[0].points.map(({ values }) => values)
    );
    assert.match(trails.children[0].material.fragmentShader, /pythonTrailFrontness/);
    assert.match(trails.children[0].material.fragmentShader, /float pythonTrailBase = 0\.0;/);
    assert.equal(
        trails.children[0].material.customProgramCacheKey(),
        'python-trail-distinct-pair-v9'
    );

    updatePythonPlanetTrails(trails, 0);
    updatePythonPlanetTrails(trails, 20);
    assert.ok(Math.abs(
        trails.userData.pythonTrailUniforms.pythonTrailTime.value - (0.02 / 9)
    ) < 1e-12);
    updatePythonPlanetTrails(trails, 10_020);
    assert.ok(Math.abs(
        trails.userData.pythonTrailUniforms.pythonTrailTime.value - (0.02 / 9 + 0.08 / 9)
    ) < 1e-12);
});
