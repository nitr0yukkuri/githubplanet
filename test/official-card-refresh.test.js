import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { refreshOfficialCard } from '../scripts/refresh-official-card.mjs';

test('refreshes with a header token after waiting for deployment and validates the returned login', async () => {
    let time = 0;
    const calls = [];
    const username = await refreshOfficialCard({ token: 'fixture-token', now: () => time,
        wait: async (ms) => { time += ms; }, fetchImpl: async (url, options) => {
            calls.push([url, options]);
            return calls.length === 1 ? { status: 404 } : { ok: true, json: async () => ({ username: 'renamed-user' }) };
        } });
    assert.equal(username, 'renamed-user');
    assert.equal(calls.length, 2);
    assert.equal(calls[0][1].headers.Authorization, 'Bearer fixture-token');
    assert.equal(calls[0][1].redirect, 'error');
    assert.equal(calls[0][0].includes('fixture-token'), false);
});

test('rejects missing credentials before network work', async () => {
    await assert.rejects(refreshOfficialCard({ fetchImpl: () => assert.fail() }), /Configure CARD_REFRESH_TOKEN/);
});

test('rejects refresh errors and environment-file injection before a card is recorded', async () => {
    await assert.rejects(refreshOfficialCard({ token: 'fixture', fetchImpl: async () => ({ status: 503 }) }), /503/);
    await assert.rejects(refreshOfficialCard({ token: 'fixture', fetchImpl: async () => ({ ok: true,
        json: async () => ({ username: 'name\nINJECT=value' }) }) }), /invalid username/);
});

test('bounds deployment retries', async () => {
    let time = 0, calls = 0;
    await assert.rejects(refreshOfficialCard({ token: 'fixture', timeoutMs: 1000,
        now: () => time, wait: async (ms) => { time += ms; },
        fetchImpl: async () => { calls++; return { status: 404 }; } }), /timed out/);
    assert.equal(calls, 1);
});

test('keeps existing card publication available until refresh is explicitly enabled', () => {
    const workflow = fs.readFileSync(new URL('../.github/workflows/update-card.yml', import.meta.url), 'utf8');
    assert.match(workflow, /CARD_PROFILE_USERNAME: nitr0yukkuri/);
    assert.match(workflow, /name: Refresh official profile planet data\s+if: vars\.OFFICIAL_CARD_REFRESH_ENABLED == 'true'/);
    assert.match(workflow, /name: Validate official refresh settings[\s\S]*?--check-config/);
});
