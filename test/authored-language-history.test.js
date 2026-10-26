import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthoredLanguageHistory } from '../src/domain/planet/authored-language-history.js';
import { createAuthoredLanguageHistoryService } from '../src/application/authored-language-history-service.js';

test('replays cumulative added lines and changes the leading language by date', () => {
    const history = buildAuthoredLanguageHistory([
        { authoredAt: '2024-03-01T10:00:00Z', languageAdditions: { CSS: 20, JavaScript: 3 } },
        { authoredAt: '2024-03-01T11:00:00Z', languageAdditions: { CSS: 5 } },
        { authoredAt: '2025-01-01T00:00:00Z', languageAdditions: { TypeScript: 30 } }
    ]);

    assert.deepEqual(history.map(({ date, mainLanguage }) => [date, mainLanguage]), [
        ['2024-03-01', 'CSS'],
        ['2025-01-01', 'TypeScript']
    ]);
    assert.deepEqual(history[1].languageStats, { CSS: 25, JavaScript: 3, TypeScript: 30 });
});

test('marks budget-limited results partial and persists them for a later scan', async () => {
    const calls = [];
    const repository = {
        async getAuthoredLanguageHistoryScan() { return null; },
        async tryStartAuthoredLanguageHistoryScan(id) { calls.push(['start', id]); return { scanStatus: 'running' }; },
        async findAuthoredLanguageCommitKeys() { return []; },
        async saveAuthoredLanguageCommits(id, rows) { calls.push(['save', id, rows.length]); },
        async updateAuthoredLanguageHistoryScan() {},
        async pauseAuthoredLanguageHistoryScan(id, progress, retryAfterMs) {
            calls.push(['pause', id, retryAfterMs, progress.apiRequests]);
        },
        async completeAuthoredLanguageHistoryScan() { assert.fail('partial scan must not be completed'); },
        async failAuthoredLanguageHistoryScan(...args) { calls.push(['fail', ...args]); },
        async getAuthoredLanguageHistoryScan() {
            return {
                scanStatus: 'partial', apiRequests: 800, requestBudgetReached: true,
                repositoriesScanned: 1, commitsFound: 1, commitsScanned: 1
            };
        },
        async findAuthoredLanguageCommits() {
            return [{ authoredAt: '2025-01-01T00:00:00Z', languageAdditions: { TypeScript: 4 } }];
        }
    };
    const service = createAuthoredLanguageHistoryService({
        repository,
        githubClient: {
            async scanHistoricalAuthoredLanguageCommits({ onBatch, onProgress }) {
                const progress = { apiRequests: 800, requestBudgetReached: true };
                await onBatch([{ repositoryFullName: 'alice/repo', commitSha: 'sha', authoredAt: '2025-01-01T00:00:00Z' }]);
                await onProgress(progress);
                return progress;
            }
        }
    });

    assert.equal(await service.startScan({
        githubId: 42, login: 'alice', accessToken: 'secret', accountCreatedAt: '2020-01-01T00:00:00Z'
    }), true);
    const result = await service.getHistory(42);

    assert.equal(result.status.state, 'partial');
    assert.equal(result.status.partial, true);
    assert.equal(result.status.apiRequests, 800);
    assert.equal(result.history[0].mainLanguage, 'TypeScript');
    assert.ok(calls.some(([operation, , retryAfterMs, apiRequests]) => (
        operation === 'pause' && retryAfterMs === 6 * 60 * 60 * 1_000 && apiRequests === 800
    )));
});

test('continues short request chunks while preserving the cumulative request budget', async () => {
    let scan = null;
    let initialRequests = [];
    const repository = {
        async getAuthoredLanguageHistoryScan() { return scan; },
        async tryStartAuthoredLanguageHistoryScan() {
            scan = { ...(scan || {}), scanStatus: 'running' };
            return scan;
        },
        async findAuthoredLanguageCommitKeys() { return []; },
        async saveAuthoredLanguageCommits() {},
        async updateAuthoredLanguageHistoryScan() {},
        async pauseAuthoredLanguageHistoryScan(id, progress, retryAfterMs) {
            scan = { ...progress, scanStatus: 'partial', retryAfterMs };
        },
        async completeAuthoredLanguageHistoryScan(id, progress) {
            scan = { ...progress, scanStatus: 'complete' };
        },
        async failAuthoredLanguageHistoryScan() { assert.fail('request chunks should not fail'); },
        async findAuthoredLanguageCommits() { return []; }
    };
    const service = createAuthoredLanguageHistoryService({
        repository,
        githubClient: {
            async scanHistoricalAuthoredLanguageCommits({ initialProgress = {} }) {
                initialRequests.push(Number(initialProgress.apiRequests) || 0);
                return {
                    ...initialProgress,
                    apiRequests: (Number(initialProgress.apiRequests) || 0) + 15,
                    requestBudgetReached: false,
                    yielded: initialRequests.length === 1
                };
            }
        }
    });
    const input = { githubId: 99, login: 'alice', accessToken: 'token', accountCreatedAt: '2020-01-01T00:00:00Z' };

    await service.startScan(input);
    assert.equal(scan.scanStatus, 'partial');
    assert.equal(scan.retryAfterMs, 1_000);
    await service.startScan(input);

    assert.deepEqual(initialRequests, [0, 15]);
    assert.equal(scan.scanStatus, 'complete');
    assert.equal(scan.apiRequests, 30);
});

test('counts one authored commit once when repository ownership changed', () => {
    const history = buildAuthoredLanguageHistory([
        { commitSha: 'abc123', authoredAt: '2025-01-01T10:00:00Z', languageAdditions: { TypeScript: 12 } },
        { commitSha: 'ABC123', authoredAt: '2025-01-01T10:00:00Z', languageAdditions: { TypeScript: 12 } }
    ]);

    assert.deepEqual(history[0].languageStats, { TypeScript: 12 });
});
