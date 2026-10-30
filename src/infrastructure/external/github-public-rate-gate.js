import { safeErrorMetadata } from '../../shared/error-metadata.js';

function header(headers, name) {
    return headers?.get?.(name) ?? Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name)?.[1];
}

export function createGithubPublicRateGate({ store, key, limit, reserve = 5, now = Date.now, logger = console }) {
    let blockedUntil = 0;
    function limited(retryAfterMs) {
        return Object.assign(new Error('GitHub public request budget is cooling down'), {
            code: 'GITHUB_PUBLIC_QUOTA_EXCEEDED', retryAfterMs,
            response: { status: 429, headers: { 'retry-after': String(Math.ceil(retryAfterMs / 1000)) } }
        });
    }
    async function observe(headers, throttled = false) {
        const rawRemaining = header(headers, 'x-ratelimit-remaining');
        const remaining = rawRemaining === undefined ? NaN : Number(rawRemaining);
        if (!throttled && (!Number.isFinite(remaining) || remaining > reserve)) return;
        const retryHeader = header(headers, 'retry-after');
        const retryMs = Number(retryHeader) > 0 ? Number(retryHeader) * 1000 : Date.parse(retryHeader) - now();
        const resetMs = Number(header(headers, 'x-ratelimit-reset')) * 1000 - now();
        const hints = [retryMs, resetMs].filter((value) => Number.isFinite(value) && value > 0);
        const delay = Math.min(86400000, hints.length ? Math.max(...hints) : 60000);
        blockedUntil = Math.max(blockedUntil, now() + delay);
        await store.block(key, blockedUntil).catch((error) => logger.warn('[GitHub public quota] Could not share cooldown:', safeErrorMetadata(error)));
    }
    return {
        async run(operation) {
            if (blockedUntil > now()) throw limited(blockedUntil - now());
            let reservation;
            try { reservation = await store.reserve(key, limit, 3600000); }
            catch {
                throw Object.assign(new Error('GitHub public request budget is unavailable'), {
                    code: 'GITHUB_PUBLIC_BUDGET_UNAVAILABLE', response: { status: 503 }, retryAfterMs: 60000
                });
            }
            if (!reservation.allowed) {
                blockedUntil = now() + Math.max(1000, reservation.retryAfterMs);
                throw limited(blockedUntil - now());
            }
            try {
                const response = await operation();
                await observe(response.headers);
                return response;
            } catch (error) {
                const headers = error.response?.headers;
                if (error.response?.status === 429 || (error.response?.status === 403
                    && (String(header(headers, 'x-ratelimit-remaining')) === '0' || header(headers, 'retry-after')))) {
                    await observe(headers, true);
                }
                throw error;
            }
        }
    };
}
