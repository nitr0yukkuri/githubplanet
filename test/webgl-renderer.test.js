import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWebGLRenderer } from '../front/js/webgl-renderer.js';

test('returns a renderer when WebGL initialization succeeds', () => {
    const renderer = { domElement: {} };
    class FakeWebGLRenderer {
        constructor(options) {
            this.options = options;
            return renderer;
        }
    }

    assert.equal(createWebGLRenderer({ WebGLRenderer: FakeWebGLRenderer }, { antialias: true }), renderer);
});

test('returns null when the browser cannot create a WebGL context', () => {
    class UnsupportedWebGLRenderer {
        constructor() {
            throw new Error('WebGL context unavailable');
        }
    }

    assert.equal(createWebGLRenderer({ WebGLRenderer: UnsupportedWebGLRenderer }, {}), null);
    assert.equal(createWebGLRenderer({}, {}), null);
});
