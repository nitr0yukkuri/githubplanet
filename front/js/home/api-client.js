import { DEFAULT_SHOWCASE_SLUG } from '../home-route.js';

// 通信の期限とfallbackだけを担当し、ログインUIやシーン状態には触れない。
export function createHomeApi({ fetchImpl = globalThis.fetch, timeoutMs = 15_000, now = Date.now } = {}) {
    async function fetchHomeApi(input, options = {}, requestTimeoutMs = timeoutMs) {
        const controller = new AbortController();
        const timeoutId = globalThis.setTimeout(() => controller.abort(), requestTimeoutMs);
        try {
            return await fetchImpl(input, { ...options, signal: controller.signal });
        } finally {
            globalThis.clearTimeout(timeoutId);
        }
    }

    async function fetchShowcasePlanetData(showcaseSlug) {
        try {
            const res = await fetchHomeApi(
                `/api/planets/showcase/${encodeURIComponent(showcaseSlug)}?t=${now()}`,
                { cache: 'no-store' }
            );
            if (res.ok) return await res.json();

            if (showcaseSlug !== DEFAULT_SHOWCASE_SLUG) {
                const fallback = await fetchHomeApi(
                    `/api/planets/showcase/${DEFAULT_SHOWCASE_SLUG}?t=${now()}`,
                    { cache: 'no-store' }
                );
                return fallback.ok ? await fallback.json() : null;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    return { fetchApi: fetchHomeApi, fetchShowcase: fetchShowcasePlanetData };
}
