import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { calculateStarCount, createPlanetDisposalResources, disposePlanetObject } from '../front/js/planet-scene-resources.js';

test('keeps the shared star count thresholds and upper bound', () => {
    for (const [commits, count] of [[0, 0], [9, 0], [10, 1], [49, 4], [50, 5], [69, 5], [70, 6], [14999, 119], [15000, 120], [Infinity, 120]]) {
        assert.equal(calculateStarCount(commits), count);
    }
});

test('disposes shared scene resources once while retaining the cached planet texture', () => {
    const geometry = new THREE.BufferGeometry();
    const planetTexture = new THREE.Texture();
    const temporaryTexture = new THREE.Texture();
    const material = new THREE.MeshBasicMaterial({ map: planetTexture, aoMap: temporaryTexture });
    const extraMaterial = new THREE.MeshBasicMaterial({ map: temporaryTexture });
    const counts = new Map();
    for (const resource of [geometry, planetTexture, temporaryTexture, material, extraMaterial]) {
        counts.set(resource, 0);
        resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
    }
    const first = new THREE.Group();
    const second = new THREE.Group();
    first.add(new THREE.Mesh(geometry, [material, extraMaterial]));
    second.add(new THREE.Mesh(geometry, material));
    const resources = createPlanetDisposalResources([planetTexture]);
    disposePlanetObject(first, resources);
    disposePlanetObject(second, resources);
    assert.equal(first.children.length, 0);
    assert.equal(second.children.length, 0);
    assert.equal(counts.get(planetTexture), 0);
    for (const resource of [geometry, temporaryTexture, material, extraMaterial]) {
        assert.equal(counts.get(resource), 1);
    }
    disposePlanetObject(null);
});
