import assert from 'node:assert/strict';
import test from 'node:test';
import { createLanguageHistoryController } from '../front/js/home/language-history-controller.js';

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function fixture(fetchApi) {
    const calls = [];
    const state = { planet: { username: 'Owner' }, publicRoute: false, views: 0 };
    const select = () => {};
    const controller = createLanguageHistoryController({
        fetchApi,
        getCurrentPlanet: () => state.planet,
        getLoggedInUsername: () => 'OWNER',
        isPublicPlanetRoute: () => state.publicRoute,
        getElement: () => ({}),
        translate: (key) => key,
        onSelect: select,
        createView: ({ onSelect }) => {
            assert.equal(onSelect, select);
            state.views++;
            return { hide: () => calls.push('hide'), show: (...args) => calls.push(args) };
        }
    });
    return { controller, state, calls };
}

test('keeps owner history private and creates one view across planet switches', async () => {
    let requests = 0;
    const history = [{ mainLanguage: 'JavaScript' }];
    const { controller, state, calls } = fixture(async (url, options) => {
        requests++;
        assert.equal(url, '/api/me/language-history');
        assert.equal(options.cache, 'no-store');
        return { ok: true, json: async () => ({ history }) };
    });
    await controller.update(state.planet);
    assert.deepEqual(calls[0], [history, state.planet]);
    state.publicRoute = true;
    await controller.update(state.planet);
    state.publicRoute = false;
    state.planet = { username: 'visitor' };
    await controller.update(state.planet);
    assert.equal(requests, 1);
    assert.deepEqual(calls.slice(1), ['hide', 'hide']);
    assert.equal(state.views, 1);
});

test('ignores old responses when another planet hides the history', async () => {
    const response = deferred();
    const { controller, state, calls } = fixture(() => response.promise);
    const pending = controller.update(state.planet);
    state.planet = { username: 'visitor' };
    await controller.update(state.planet);
    response.resolve({ ok: true, json: async () => assert.fail('stale response must not be decoded') });
    await pending;
    assert.deepEqual(calls, ['hide']);
});

test('checks planet identity again after JSON decoding and ignores stale failures', async () => {
    const payload = deferred();
    const oldFailure = deferred();
    let requests = 0;
    const { controller, state, calls } = fixture(async () => {
        if (++requests === 1) return oldFailure.promise;
        return { ok: true, json: () => payload.promise };
    });
    const old = controller.update(state.planet);
    const newer = controller.update(state.planet);
    await Promise.resolve();
    state.planet = { username: 'Owner' };
    payload.resolve({ history: [] });
    await newer;
    oldFailure.reject(new Error('late network failure'));
    await old;
    assert.deepEqual(calls, []);
});

test('hides failed current history without changing the selected planet', async () => {
    const { controller, state, calls } = fixture(async () => ({ ok: false }));
    const original = state.planet;
    await controller.update(original);
    assert.equal(state.planet, original);
    assert.deepEqual(calls, ['hide']);
});
