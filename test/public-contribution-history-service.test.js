import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicContributionHistoryService } from '../src/application/public-contribution-history-service.js';

function publicHistory() {
    return {
        githubLogin: 'octocat',
        calendarStartedAt: '2025-01-01T00:00:00.000Z',
        calendarYears: [2025],
        dailyContributions: [],
        capturedAt: '2025-01-02T00:00:00.000Z'
    };
}

test('refreshes one queued profile and persists its public calendar', async () => {
    const calls = [];
    const historyRepository = {
        async claimNextPublicHistoryRefresh() { calls.push('claim'); return { githubId: '42', username: 'octocat', failureCount: 0 }; },
        async findPublicContributionHistory(id) { calls.push(['find', id]); return null; },
        async savePublicContributionHistory(id, value) { calls.push(['save', id, value]); },
        async completePublicHistoryRefresh(id) { calls.push(['complete', id]); },
        async failPublicHistoryRefresh() { assert.fail('successful refresh must not be marked failed'); }
    };
    const githubClient = {
        async getPublicContributionHistory(options) {
            calls.push(['fetch', options]);
            return publicHistory();
        }
    };
    const service = createPublicContributionHistoryService({ historyRepository, githubClient });

    assert.deepEqual(await service.refreshNext(), {
        status: 'refreshed', githubId: '42', capturedAt: publicHistory().capturedAt
    });
    assert.equal(calls[0], 'claim');
    assert.deepEqual(calls[1], ['find', '42']);
    assert.equal(calls[2][0], 'fetch');
    assert.equal(calls[2][1].deadlineMs, 90_000);
    assert.deepEqual(calls.at(-1), ['complete', '42']);
});

test('backs off a GitHub rate limit and leaves the profile in the queue', async () => {
    let failure;
    const service = createPublicContributionHistoryService({
        historyRepository: {
            async claimNextPublicHistoryRefresh() { return { githubId: '42', username: 'octocat', failureCount: 0 }; },
            async findPublicContributionHistory() { return null; },
            async failPublicHistoryRefresh(id, value) { failure = { id, ...value }; },
            async savePublicContributionHistory() { assert.fail('rate-limited history must not be saved'); },
            async completePublicHistoryRefresh() { assert.fail('rate-limited history must remain retryable'); }
        },
        githubClient: {
            async getPublicContributionHistory() {
                const error = new Error('rate limited');
                error.response = { status: 429, headers: { 'retry-after': '600' } };
                throw error;
            }
        }
    });

    assert.deepEqual(await service.refreshNext(), { status: 'deferred', reason: 'GITHUB_THROTTLED' });
    assert.equal(failure.id, '42');
    assert.equal(failure.failureCode, 'GITHUB_THROTTLED');
    assert.ok(failure.retryAfterMs >= 600_000);
});

test('does not call GitHub when the queue is empty', async () => {
    let fetches = 0;
    const service = createPublicContributionHistoryService({
        historyRepository: {
            async claimNextPublicHistoryRefresh() { return null; },
            async completePublicHistoryRefresh() {},
            async failPublicHistoryRefresh() {},
            async savePublicContributionHistory() {}
        },
        githubClient: { async getPublicContributionHistory() { fetches += 1; } }
    });

    assert.deepEqual(await service.refreshNext(), { status: 'idle' });
    assert.equal(fetches, 0);
});

test('serves saved public history without querying GitHub', async () => {
    let lookups = 0;
    const service = createPublicContributionHistoryService({
        planetRepository: { async findByUsername(name) { return { githubId: '42', username: name }; } },
        historyRepository: {
            async findPublicContributionHistory(id) { lookups += 1; assert.equal(id, '42'); return publicHistory(); }
        },
        githubClient: { async getPublicContributionHistory() { assert.fail('public reads use cached PostgreSQL data'); } }
    });

    assert.deepEqual(await service.getByUsername('octocat'), {
        githubId: '42', username: 'octocat', status: 'ready', history: publicHistory()
    });
    assert.equal(lookups, 1);
});
