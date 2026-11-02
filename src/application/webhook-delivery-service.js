import crypto from 'node:crypto';
import { safeErrorMetadata } from '../shared/error-metadata.js';

function meteorPayload(payload) {
    const commits = payload?.repository && Array.isArray(payload.commits) ? payload.commits : [];
    // 認証情報や不要なcommit本文をDBへ持ち込まず、演出に必要な公開情報だけを保持する。
    return {
        repository: { language: String(payload?.repository?.language || 'Unknown') },
        commits: commits.map((commit) => {
            if (typeof commit?.id !== 'string' || !commit.id) throw new TypeError('Invalid webhook commit');
            return {
                id: commit.id,
                total_lines: Math.max(0, Number.parseInt(commit.total_lines, 10) || 0),
                added: (Array.isArray(commit.added) ? commit.added : []).filter((file) => typeof file === 'string'),
                modified: (Array.isArray(commit.modified) ? commit.modified : []).filter((file) => typeof file === 'string')
            };
        })
    };
}

export function createWebhookDeliveryService({ store, meteorService, logger = console, newLeaseToken = crypto.randomUUID }) {
    return {
        async accept(deliveryId, payloadHash, payload) {
            return store.enqueue(deliveryId, payloadHash, meteorPayload(payload));
        },
        async processPending(limit = 5) {
            let processed = 0;
            for (let index = 0; index < limit; index++) {
                const job = await store.claimPending(newLeaseToken());
                if (!job) break;
                try {
                    await meteorService.processWebhook(job.payload, { eventKey: `github-webhook:${job.id}` });
                    await store.complete(job);
                    processed++;
                } catch (error) {
                    const metadata = safeErrorMetadata(error);
                    await store.retry(job, String(metadata.errorCode || 'unknown').slice(0, 80),
                        1000 * 2 ** Math.min(job.attempts, 9));
                    logger.warn('[Webhook] Processing deferred for retry:', metadata);
                }
            }
            return processed;
        },
        cleanup: () => store.cleanup()
    };
}
