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
    let serial = 0;
    const axios = {
        async post() {
            calls += 1;
            return { headers: { 'x-ratelimit-remaining': '5000' }, data: { data: { user: {
                contributionsCollection: { commitContributionsByRepository: [{ repository: {
                    nameWithOwner: 'alice/project', isPrivate: false
                } }] }
            } } } };
        },
        async get(url) {
            calls += 1;
            if (url.endsWith('/commits')) {
                const n = serial++ * 100;
                return { headers: { 'x-ratelimit-remaining': String(5000 - calls) }, data: Array.from({ length: 100 }, (_, i) => ({
                    sha: `sha-${n + i}`, commit: { author: { date: '2025-01-02T03:00:00Z' } }
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
