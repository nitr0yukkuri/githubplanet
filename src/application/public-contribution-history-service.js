import { safeErrorMetadata } from '../shared/error-metadata.js';

const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function getFailure(error, failureCount) {
    const headers = error.response?.headers || {};
    const retryAfterMs = Number(headers['retry-after']) * 1_000 || 0;
    const resetDelayMs = (Number(headers['x-ratelimit-reset']) * 1_000 || 0) - Date.now();
    const status = Number(error.response?.status) || 0;
    if (status === 404) {
        return { failureCode: 'PROFILE_NOT_FOUND', retryAfterMs: Math.max(7 * DAY_MS, retryAfterMs) };
    }
    if ([403, 429].includes(status)) {
        return { failureCode: 'GITHUB_THROTTLED', retryAfterMs: Math.max(HOUR_MS, retryAfterMs, resetDelayMs) };
    }
    return {
        failureCode: status ? `GITHUB_${status}` : 'PUBLIC_HISTORY_FAILED',
        retryAfterMs: Math.min(7 * DAY_MS, 5 * MINUTE_MS * (2 ** Math.min(failureCount, 10)))
    };
}

export function createPublicContributionHistoryService({ planetRepository, historyRepository, githubClient }) {
    async function getByUsername(username) {
        // 閲覧時にはDBの保存値だけ返し、アクセス集中でGitHub取得が増えないよう更新は別キューに分ける。
        if (!planetRepository?.findByUsername || !historyRepository?.findPublicContributionHistory) return null;
        const planet = await planetRepository.findByUsername(username);
        if (!planet) return null;
        const history = await historyRepository.findPublicContributionHistory(planet.githubId);
        return {
            githubId: String(planet.githubId),
            username: planet.username,
            status: history ? 'ready' : 'pending',
            history
        };
    }

    async function refreshNext() {
        if (!historyRepository?.claimNextPublicHistoryRefresh
            || !historyRepository?.completePublicHistoryRefresh
            || !historyRepository?.failPublicHistoryRefresh
            || !historyRepository?.savePublicContributionHistory
            || !githubClient?.getPublicContributionHistory) {
            throw new Error('Public contribution history refresh is unavailable');
        }

        const target = await historyRepository.claimNextPublicHistoryRefresh();
        if (!target) return { status: 'idle' };

        let history;
        try {
            const existingHistory = await historyRepository.findPublicContributionHistory(target.githubId);
            history = await githubClient.getPublicContributionHistory({
                githubId: target.githubId,
                username: target.username,
                existingHistory,
                deadlineMs: 90_000
            });
            if (!history?.calendarStartedAt) throw new Error('Public contribution history is incomplete');
        } catch (error) {
            const failure = getFailure(error, target.failureCount || 0);
            await historyRepository.failPublicHistoryRefresh(target.githubId, failure);
            console.warn('[Public History] Refresh deferred:', safeErrorMetadata(error).code || failure.failureCode);
            return { status: 'deferred', reason: failure.failureCode };
        }

        try {
            await historyRepository.savePublicContributionHistory(target.githubId, history);
            await historyRepository.completePublicHistoryRefresh(target.githubId);
        } catch (error) {
            await historyRepository.failPublicHistoryRefresh(target.githubId, {
                failureCode: 'DATABASE_SAVE_FAILED',
                retryAfterMs: 5 * MINUTE_MS
            }).catch(() => undefined);
            throw error;
        }
        return { status: 'refreshed', githubId: target.githubId, capturedAt: history.capturedAt };
    }

    return { getByUsername, refreshNext };
}
