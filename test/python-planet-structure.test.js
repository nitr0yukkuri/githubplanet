import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createPythonPlanetMaterial,
    isPythonPlanet
} from '../front/js/python-planet-structure.js';

class FakeMaterial {
    constructor(options) {
        Object.assign(this, options);
    }
}

const THREE = { MeshStandardMaterial: FakeMaterial };

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
