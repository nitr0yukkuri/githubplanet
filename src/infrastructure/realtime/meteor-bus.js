import crypto from 'node:crypto';
import { safeErrorMetadata } from '../../shared/error-metadata.js';

export function createMeteorBus({ store, emit, intervalMs = 1000, logger = console }) {
    const subscribers = new Set();
    let cursor = null, initializing = null, polling = null, timer = null, stopped = false, lastCleanup = 0, generation = 0;
    async function initialize() {
        while (cursor === null && !stopped) {
            if (!initializing) {
                const expected = generation;
                initializing = store.latestId().then((id) => { if (generation === expected) cursor = id; })
                    .finally(() => { initializing = null; });
            }
            await initializing;
        }
    }
    async function poll() {
        if (stopped || !subscribers.size) return;
        if (polling) return polling;
        let hasMore = false;
        const expected = generation;
        polling = (async () => {
            try {
                await initialize();
                if (stopped || expected !== generation) return;
                const events = await store.readAfter(cursor);
                if (stopped || expected !== generation) return;
                for (const event of events) {
                    emit(event.payload);
                    cursor = event.id;
                }
                hasMore = events.length >= 100;
            } catch (error) { logger.warn('[Meteor bus] Will retry:', safeErrorMetadata(error)); }
        })();
        try { await polling; } finally {
            polling = null;
            clearTimeout(timer);
            if (!stopped && subscribers.size) { timer = setTimeout(poll, hasMore ? 0 : intervalMs); timer.unref?.(); }
        }
    }
    return {
        async subscribe(id) {
            if (stopped) return;
            subscribers.add(id);
            await poll();
        },
        unsubscribe(id) {
            subscribers.delete(id);
            if (!subscribers.size) { clearTimeout(timer); generation++; cursor = null; }
        },
        async publish(payload, eventKey = crypto.randomUUID()) {
            if (typeof payload?.color !== 'string' || !/^#[\da-f]{6}$/i.test(payload.color)
                || typeof payload.language !== 'string' || !Number.isFinite(payload.scale)) {
                throw new TypeError('Invalid meteor event');
            }
            if (subscribers.size) await initialize();
            await store.append(eventKey, payload);
            // DB保存が成功してから仕事を完了させ、別インスタンスのreaderも同じ通知を取得する。
            await poll();
            if (Date.now() - lastCleanup >= 3_600_000) {
                try { await store.cleanup(); lastCleanup = Date.now(); }
                catch (error) { logger.warn('[Meteor bus] Cleanup deferred:', safeErrorMetadata(error)); }
            }
        },
        async stop() { stopped = true; generation++; clearTimeout(timer); await polling; subscribers.clear(); }
    };
}
