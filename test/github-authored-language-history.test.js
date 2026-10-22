import assert from 'node:assert/strict';
import test from 'node:test';
import { createGithubAuthoredLanguageHistoryClient } from '../src/infrastructure/external/github-authored-language-history.js';

function createClient({ axios, extensionMap = { ts: 'TypeScript', js: 'JavaScript' } }) {
    return createGithubAuthoredLanguageHistoryClient({ axios, extensionMap });
}

test('classifies commit additions from public repository file extensions', async () => {
    const axios = {
        async post() {
            return { headers: { 'x-ratelimit-remaining': '5000' }, data: { data: { user: {
                contributionsCollection: { commitContributionsByRepository: [{ repository: {
                    nameWithOwner: 'alice/project', isPrivate: false
                } }] }
            } } } };
        },
        async get(url) {
            if (url.endsWith('/commits')) {
                return { headers: { 'x-ratelimit-remaining': '4999' }, data: [{
                    sha: 'abc', commit: { author: { date: '2025-01-02T03:00:00Z' } }
                }] };
            }
            return { headers: { 'x-ratelimit-remaining': '4998' }, data: {
                stats: { additions: 5 },
                files: [{ filename: 'src/main.ts', additions: 3 }, { filename: 'docs/readme.md', additions: 2 }],
                commit: { author: { date: '2025-01-02T03:00:00Z' } }
            } };
        }
    };
    const saved = [];
    const client = createClient({ axios, extensionMap: { ts: 'TypeScript' } });
    const progress = await client.scanHistoricalAuthoredLanguageCommits({
        login: 'alice', accessToken: 'token', accountCreatedAt: '2025-01-01T00:00:00Z', now: '2025-12-31T00:00:00Z',
        onBatch: async (rows) => saved.push(...rows)
    });

    assert.equal(progress.apiRequests, 3);
    assert.equal(saved[0].languageAdditions.TypeScript, 3);
    assert.equal(saved[0].unclassifiedAddedLines, 2);
    assert.equal(saved[0].filesComplete, true);
});

test('never exceeds the hard 800 request cap, including parallel detail requests', async () => {
    let calls = 0;
    const axios = {
        async post() {
            calls += 1;
            return { headers: { 'x-ratelimit-remaining': '5000' }, data: { data: { user: {
                contributionsCollection: { commitContributionsByRepository: [{ repository: {
                    nameWithOwner: 'alice/project', isPrivate: false
                } }] }
            } } } };
        },
        async get(url, config) {
            calls += 1;
            if (url.endsWith('/commits')) {
                const page = Number(config.params.page);
                return { headers: { 'x-ratelimit-remaining': String(5000 - calls) }, data: Array.from({ length: 100 }, (_, i) => ({
                    sha: `sha-${page}-${i}`, commit: { author: { date: '2025-01-02T03:00:00Z' } }
                })) };
            }
            return { headers: { 'x-ratelimit-remaining': String(5000 - calls) }, data: {
                stats: { additions: 1 }, files: [{ filename: 'main.ts', additions: 1 }],
                commit: { author: { date: '2025-01-02T03:00:00Z' } }
            } };
        }
    };
    const client = createClient({ axios });
    let progress = {};
    let iterations = 0;
    const knownCommits = new Set();
    while (iterations < 100) {
        const callsBefore = calls;
        progress = await client.scanHistoricalAuthoredLanguageCommits({
            login: 'alice', accessToken: 'token', accountCreatedAt: '2025-01-01T00:00:00Z', now: '2025-12-31T00:00:00Z',
            initialProgress: progress,
            knownCommits,
            onBatch: async (rows) => {
                for (const row of rows) knownCommits.add(`${row.repositoryFullName.toLowerCase()}:${row.commitSha.toLowerCase()}`);
            }
        });
        assert.ok(calls - callsBefore <= 15, 'an HTTP request chunk must stay within 15 GitHub API calls');
        iterations += 1;
        if (!progress.yielded) break;
    }

    assert.equal(progress.apiRequests, 800);
    assert.equal(progress.requestBudgetReached, true);
    assert.equal(calls, 800);
    assert.ok(iterations > 1);
});

test('resumes at the saved commit page instead of replaying earlier pages', async () => {
    const requestedPages = [];
    const axios = {
        async post() {
            return { headers: { 'x-ratelimit-remaining': '5000' }, data: { data: { user: {
                contributionsCollection: { commitContributionsByRepository: [{ repository: {
                    nameWithOwner: 'alice/project', isPrivate: false
                } }] }
            } } } };
        },
        async get(url, config) {
            const page = Number(config.params.page);
            requestedPages.push(page);
            if (page > 20) return { headers: { 'x-ratelimit-remaining': '4000' }, data: [] };
            return { headers: { 'x-ratelimit-remaining': '4000' }, data: Array.from({ length: 100 }, (_, i) => ({
                sha: `sha-${page}-${i}`, commit: { author: { date: '2025-01-02T03:00:00Z' } }
            })) };
        }
    };
    const knownCommits = new Set(Array.from({ length: 20 * 100 }, (_, index) => (
        `alice/project:sha-${Math.floor(index / 100) + 1}-${index % 100}`
    )));
    const client = createClient({ axios });
    const input = {
        login: 'alice', accessToken: 'token', accountCreatedAt: '2025-01-01T00:00:00Z',
        now: '2025-12-31T00:00:00Z', knownCommits
    };

    const firstChunk = await client.scanHistoricalAuthoredLanguageCommits(input);
    assert.equal(firstChunk.yielded, true);
    assert.deepEqual(firstChunk.scanCursor, {
        year: 2025, repositoryFullName: 'alice/project', page: 15
    });
    assert.deepEqual(requestedPages, Array.from({ length: 14 }, (_, index) => index + 1));

    const secondChunk = await client.scanHistoricalAuthoredLanguageCommits({
        ...input,
        initialProgress: firstChunk
    });

    assert.deepEqual(requestedPages.slice(14), [15, 16, 17, 18, 19, 20, 21]);
    assert.equal(secondChunk.yielded, false);
    assert.deepEqual(secondChunk.scanCursor, {});
});

test('stops before the REST reserve is exhausted', async () => {
    let restCalls = 0;
    const axios = {
        async post() {
            return { headers: { 'x-ratelimit-remaining': '5000' }, data: { data: { user: {
                contributionsCollection: { commitContributionsByRepository: [{ repository: {
                    nameWithOwner: 'alice/project', isPrivate: false
                } }] }
            } } } };
        },
        async get(url) {
            restCalls += 1;
            assert.ok(url.endsWith('/commits'));
            return { headers: { 'x-ratelimit-remaining': '1000' }, data: [{ sha: 'never-fetch-detail' }] };
        }
    };
    const client = createClient({ axios });
    const progress = await client.scanHistoricalAuthoredLanguageCommits({
        login: 'alice', accessToken: 'token', accountCreatedAt: '2025-01-01T00:00:00Z', now: '2025-12-31T00:00:00Z'
    });

    assert.equal(restCalls, 1);
    assert.equal(progress.apiRequests, 2);
    assert.equal(progress.requestBudgetReached, true);
});

