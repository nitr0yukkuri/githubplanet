import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHomeRoute } from '../front/js/home-route.js';

test('keeps the normal home route unchanged', () => {
    assert.deepEqual(resolveHomeRoute('/', ''), {
        mode: 'normal',
        showcaseSlug: null
    });
});

test('forces the exhibition welcome flow on Japanese and English paths', () => {
    assert.equal(resolveHomeRoute('/exhibition').mode, 'exhibition');
    assert.equal(resolveHomeRoute('/en/exhibition').mode, 'exhibition');
});

test('resolves showcase routes and defaults to TypeScript', () => {
    assert.deepEqual(resolveHomeRoute('/showcase'), {
        mode: 'showcase',
        showcaseSlug: 'typescript'
    });
    assert.deepEqual(resolveHomeRoute('/showcase/css'), {
        mode: 'showcase',
        showcaseSlug: 'css'
    });
    assert.deepEqual(resolveHomeRoute('/en/showcase/vue/'), {
        mode: 'showcase',
        showcaseSlug: 'vue'
    });
});

test('keeps the existing query-based showcase links working', () => {
    assert.deepEqual(resolveHomeRoute('/', '?showcase=rust'), {
        mode: 'showcase',
        showcaseSlug: 'rust'
    });
});
