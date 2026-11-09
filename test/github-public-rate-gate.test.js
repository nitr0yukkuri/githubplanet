import assert from 'node:assert/strict';
import test from 'node:test';
import { createGithubPublicRateGate } from '../src/infrastructure/external/github-public-rate-gate.js';
import { createGithubClient } from '../src/infrastructure/external/github-client.js';

function quotaFixture() {
    let count = 0, blocked = 0, time = 1000000;
    const store = {
        async reserve(key, limit) {
            if (blocked > time) return { allowed: false, retryAfterMs: blocked - time };
            if (count >= limit) return { allowed: false, retryAfterMs: 3600000 };
            count++; return { allowed: true };
        },
        async block(key, until) { blocked = until; count = 0; }
    };
    return { store, now: () => time, advance(ms) { time += ms; } };
}

test('two instances share a request budget and do not call upstream after the budget is used', async () => {
    const fixture = quotaFixture();
    const gates = [0, 1].map(() => createGithubPublicRateGate({ ...fixture, key: 'public', limit: 3 }));
    let upstream = 0;
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => gates[i % 2].run(async () => { upstream++; return {}; })));
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 3);
    assert.equal(upstream, 3);
    await assert.rejects(gates[0].run(async () => assert.fail()), { code: 'GITHUB_PUBLIC_QUOTA_EXCEEDED' });
});

test('shares the upstream reset time and resumes after cooldown instead of retrying 403 repeatedly', async () => {
    const fixture = quotaFixture();
    const options = { ...fixture, key: 'public', limit: 50 };
    const first = createGithubPublicRateGate(options), other = createGithubPublicRateGate(options);
    const error = Object.assign(new Error('rate limited'), { response: { status: 403, headers: {
        'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String((fixture.now() + 30000) / 1000)
    } } });
    await assert.rejects(first.run(async () => { throw error; }), (received) => received === error);
    await assert.rejects(other.run(async () => assert.fail()), (received) => received.retryAfterMs === 30000);
    fixture.advance(30001);
    assert.equal(await first.run(async () => ({ data: 'ok' })).then((result) => result.data), 'ok');
});

test('fails closed when the budget store is unavailable', async () => {
    const gate = createGithubPublicRateGate({ store: { async reserve() { throw new Error('DB unavailable'); } }, key: 'public', limit: 50 });
    await assert.rejects(gate.run(() => assert.fail()), { code: 'GITHUB_PUBLIC_BUDGET_UNAVAILABLE' });
});

test('public REST uses server-side OAuth app auth and the shared gate, while user tokens keep their own auth', async () => {
    const calls = []; let gated = 0;
    const client = createGithubClient({ clientId: 'fixture-client', clientSecret: 'fixture-secret',
        publicRequestGate: { async run(operation) { gated++; return operation(); } },
        axios: { async get(url, config) { calls.push({ url, config }); return { data: { id: 42, login: 'fixture' } }; } } });
    await client.getUser('fixture');
    await client.getUserById(42);
    await client.getPublicPlanetSource('fixture');
    await client.getUser('fixture', 'user-token');
    assert.equal(gated, 3);
    for (const { url, config } of calls.slice(0, 3)) {
        assert.deepEqual(config.auth, { username: 'fixture-client', password: 'fixture-secret' });
        assert.equal(url.includes('fixture-secret'), false);
    }
    assert.equal(calls[3].config.auth, undefined);
    assert.equal(calls[3].config.headers.Authorization, 'Bearer user-token');
});
