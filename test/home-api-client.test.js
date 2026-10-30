import assert from 'node:assert/strict';
import test from 'node:test';
import { createHomeApi } from '../front/js/home/api-client.js';

test('falls back to TypeScript once on unavailable showcase while keeping no-store requests', async () => {
    const calls = [];
    const planet = { mainLanguage: 'TypeScript' };
    const api = createHomeApi({
        now: () => 123,
        fetchImpl: async (url, options) => {
            calls.push([url, options.cache]);
            return { ok: calls.length === 2, json: async () => planet };
        }
    });
    assert.equal(await api.fetchShowcase('C++'), planet);
    assert.deepEqual(calls, [
        ['/api/planets/showcase/C%2B%2B?t=123', 'no-store'],
        ['/api/planets/showcase/typescript?t=123', 'no-store']
    ]);
});

test('does not retry the default showcase or mask ordinary API errors', async () => {
    let calls = 0;
    const api = createHomeApi({ fetchImpl: async () => { calls++; return { ok: false }; } });
    assert.equal(await api.fetchShowcase('typescript'), null);
    assert.equal(calls, 1);
    const error = new Error('offline');
    const offline = createHomeApi({ fetchImpl: async () => { throw error; } });
    assert.equal(await offline.fetchShowcase('python'), null);
    await assert.rejects(offline.fetchApi('/api/me'), (received) => received === error);
});

test('aborts stalled requests and clears completed request deadlines', async () => {
    const stalled = createHomeApi({
        timeoutMs: 5,
        fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        })
    });
    await assert.rejects(stalled.fetchApi('/api/me'), { name: 'AbortError' });
    let completedSignal;
    const fast = createHomeApi({ timeoutMs: 5, fetchImpl: async (url, { signal }) => {
        completedSignal = signal;
        return { ok: true };
    } });
    await fast.fetchApi('/api/me');
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(completedSignal.aborted, false);
});
