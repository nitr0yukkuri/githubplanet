import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerHttpClient } from '../cloudflare/http-client.js';
import { createRequestScope } from '../cloudflare/request-scope.js';
import { checkRequestBudget } from '../cloudflare/request-budget.js';
import { pruneMeteorEvents } from '../cloudflare/meteor-retention.js';

test('the Workers fetch adapter supports JSON GET/POST without an unsupported cache mode', async () => {
    const client = createWorkerHttpClient();
    const requests = [];
    client.defaults.env = { ...client.defaults.env, fetch: async request => {
        if (request.cache === 'default') throw new TypeError('Unsupported cache mode: default');
        requests.push({ method: request.method, body: await request.text() });
        return Response.json({ ok: true });
    } };
    assert.deepEqual((await client.get('https://fixture.invalid/user')).data, { ok: true });
    assert.deepEqual((await client.post('https://fixture.invalid/token', { code: 'fixture' })).data, { ok: true });
    assert.deepEqual(requests, [{ method: 'GET', body: '' }, { method: 'POST', body: '{"code":"fixture"}' }]);
});

test('shared routes resolve concurrent service calls and session SQL from their own request', async () => {
    const scope = createRequestScope();
    const client = scope.service('githubClient');
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const make = id => ({ services: { githubClient: { async getUser() { await pending; return id; } } },
        ensurePool: () => ({ query: async () => id }) });
    const a = scope.run(make('a'), async () => [await client.getUser(), await scope.pool.query('session')]);
    const b = scope.run(make('b'), async () => [await client.getUser(), await scope.pool.query('session')]);
    release();
    assert.deepEqual(await Promise.all([a, b]), [['a', 'a'], ['b', 'b']]);
    assert.throws(() => scope.pool.query('session'), /scope is unavailable/);
});

function storage(initial = []) {
    const values = new Map(initial);
    let alarm = null, writes = 0;
    return {
        values,
        get writes() { return writes; },
        get alarm() { return alarm; },
        async get(key) { return structuredClone(values.get(key)); },
        async put(key, value) { writes++; values.set(key, structuredClone(value)); },
        async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key); },
        async getAlarm() { return alarm; },
        async setAlarm(at) { writes++; alarm = at; },
        async list({ prefix, startAfter, limit }) { return new Map([...values].filter(([key]) => key.startsWith(prefix)
            && (!startAfter || key > startAfter)).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)); }
    };
}

test('rejected rate-limit calls perform no writes and a new window resets the budget', async () => {
    const db = storage();
    for (let i = 0; i < 100; i++) assert.equal((await checkRequestBudget(db, 900000, 100, 1000)).allowed, true);
    assert.equal(db.writes, 101);
    for (let i = 0; i < 1000; i++) assert.equal((await checkRequestBudget(db, 900000, 100, 1001)).allowed, false);
    assert.equal(db.writes, 101);
    assert.equal((await checkRequestBudget(db, 900000, 100, 901000)).remaining, 99);
    assert.equal(db.alarm, 1801000);
});

test('meteor pruning passes fresh prefixes, drains more than 1000 expired records, and retains new arrivals', async () => {
    const now = 200000000, day = 86400000;
    const db = storage([
        ...Array.from({ length: 1100 }, (_, i) => ['event:a' + i.toString().padStart(5, '0'), { at: now }]),
        ...Array.from({ length: 2400 }, (_, i) => ['event:z' + i.toString().padStart(5, '0'), { at: now - day - 1 }])
    ]);
    await pruneMeteorEvents(db, now);
    assert.equal(db.alarm, now + 1000);
    db.values.set('event:000-new', { at: now });
    for (let i = 0; i < 3; i++) await pruneMeteorEvents(db, now + 1000);
    assert.equal([...db.values.keys()].filter(key => key.startsWith('event:z')).length, 0);
    assert.equal([...db.values.keys()].filter(key => key.startsWith('event:')).length, 1101);
    assert.equal(db.values.has('cleanup'), false);
    assert.equal(db.alarm, now + day);
});
