import assert from 'node:assert/strict';
import test from 'node:test';
import { startInitialPlanetLoad } from '../front/js/home/initial-planet-load.js';

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const payload = count => ({ user: { id: 42, login: 'tester' }, planetData: { totalCommits: count } });
const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });

function setup() {
    const current = deferred(), saved = deferred(), paths = [];
    const load = startInitialPlanetLoad({
        now: () => 123,
        api: { fetchApi(path, options) {
            paths.push(path);
            assert.equal(options.cache, 'no-store');
            return path.startsWith('/api/me/planet-preview') ? saved.promise : current.promise;
        } }
    });
    assert.equal(paths.length, 2, 'both requests start before either response');
    return { load, current, saved };
}

test('renders saved data before a slow refresh and keeps the latest result available', async () => {
    const { load, current, saved } = setup();
    saved.resolve(response(payload(10)));
    assert.deepEqual(await load.first, { data: payload(10), fromSaved: true });
    current.resolve(response(payload(20)));
    assert.deepEqual(await load.current, { data: payload(20), fromSaved: false });
});

test('a fast latest response wins over a slow saved response', async () => {
    const { load, current, saved } = setup();
    current.resolve(response(payload(20)));
    assert.deepEqual(await load.first, { data: payload(20), fromSaved: false });
    saved.resolve(response(payload(10)));
});

for (const unavailable of [404, 503]) {
    test(`waits for fresh data when the saved planet returns ${unavailable}`, async () => {
        const { load, current, saved } = setup();
        saved.resolve(response(null, unavailable));
        current.resolve(response(payload(20)));
        assert.deepEqual(await load.first, { data: payload(20), fromSaved: false });
    });
}

test('a refresh failure does not hide an available saved planet', async () => {
    const { load, current, saved } = setup();
    current.reject(new Error('offline'));
    saved.resolve(response(payload(10)));
    assert.equal((await load.first).fromSaved, true);
    assert.match((await load.current).error.message, /offline/);
});

test('an anonymous visit resolves without a planet', async () => {
    const { load, current, saved } = setup();
    current.resolve(response(null, 401));
    saved.resolve(response(null, 401));
    assert.equal((await load.first).data, null);
});
