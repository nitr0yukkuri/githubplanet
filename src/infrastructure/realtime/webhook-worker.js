import { safeErrorMetadata } from '../../shared/error-metadata.js';

export function createWebhookWorker({ service, intervalMs = 1000, isActive = () => true, logger = console }) {
    let timer = null, inFlight = null, stopped = true, lastCleanup = 0;
    async function tick(force = false) {
        if (stopped) return;
        if (inFlight) return inFlight;
        let processed = 0;
        inFlight = (async () => {
            try {
                // 閲覧者がいない間はDBを定期取得せず、受信要求や再接続で回収を再開する。
                if (!force && !isActive()) return;
                processed = await service.processPending();
                if (Date.now() - lastCleanup >= 3_600_000) {
                    await service.cleanup();
                    lastCleanup = Date.now();
                }
            } catch (error) { logger.warn('[Webhook worker] Will retry:', safeErrorMetadata(error)); }
        })();
        try { await inFlight; } finally {
            inFlight = null;
            if (!stopped) { clearTimeout(timer); timer = setTimeout(tick, processed >= 5 ? 0 : intervalMs); timer.unref?.(); }
        }
    }
    return {
        start() { if (!stopped) return; stopped = false; void tick(); },
        kick() { if (!stopped) void tick(true); },
        async stop() { stopped = true; clearTimeout(timer); await inFlight; }
    };
}
