import assert from 'node:assert/strict';
import test from 'node:test';
import { createGithubClient } from '../src/infrastructure/external/github-client.js';

test('splits planet data into bounded GraphQL requests and preserves the existing source shape', async () => {
    const requests = [];
    const axios = {
        async post(url, body, config) {
            requests.push({ url, body, config });
            if (body.query.includes('RepositoryData')) {
                return { data: { data: { user: {
                    starredRepositories: { totalCount: 4 },
                    repositories: { nodes: [{ name: 'owned' }] },
                    repositoriesContributedTo: { nodes: [{ name: 'contributed' }] }
                } } } };
            }
            if (body.query.includes('AnnualContributions')) {
                return { data: { data: { user: {
                    contributionsCollection: { contributionCalendar: { totalContributions: 123 } }
                } } } };
            }
            if (body.query.includes('MergedPullRequests')) {
                return { data: { data: { user: {
                    pullRequests: { nodes: [{ repository: { owner: { login: 'someone-else' } } }] }
                } } } };
            }
            return { data: { data: { user: {
                contributionsCollection: {
                    contributionCalendar: {
                        weeks: [{ contributionDays: [{ contributionCount: 7, date: '2026-07-18' }] }]
                    }
                }
            } } } };
        }
    };
    const client = createGithubClient({ axios });

    const source = await client.getPlanetSource('tester', 'token');

    assert.equal(requests.length, 4);
    assert.deepEqual(requests.map(({ config }) => config.timeout), [10_000, 10_000, 10_000, 10_000]);
    assert.deepEqual(requests.map(({ body }) => body.variables.login), ['tester', 'tester', 'tester', 'tester']);
    assert.match(requests[2].body.query, /pullRequests\(first: 100, states: MERGED/);
    assert.match(requests[2].body.query, /repository \{ owner \{ login \} \}/);
    assert.match(requests[3].body.variables.from, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(requests[3].body.variables.to, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(source, {
        starredRepositories: { totalCount: 4 },
        repositories: { nodes: [{ name: 'owned' }] },
        repositoriesContributedTo: { nodes: [{ name: 'contributed' }] },
        mergedPullRequests: [{ repository: { owner: { login: 'someone-else' } } }],
        contributionsCollection: {
            contributionCalendar: {
                totalContributions: 123,
                weeks: [{ contributionDays: [{ contributionCount: 7, date: '2026-07-18' }] }]
            }
        }
    });
});

test('stops before persistence data can be assembled when any GraphQL request fails', async () => {
    let calls = 0;
    const axios = {
        async post(url, body) {
            calls += 1;
            if (body.query.includes('AnnualContributions')) {
                return { data: { errors: [{ type: 'RESOURCE_LIMITS_EXCEEDED' }] } };
            }
            return { data: { data: { user: {
                starredRepositories: { totalCount: 0 },
                repositories: { nodes: [] },
                repositoriesContributedTo: { nodes: [] }
            } } } };
        }
    };
    const client = createGithubClient({ axios });

    await assert.rejects(() => client.getPlanetSource('tester', 'token'), /GraphQL query failed/);
    assert.equal(calls, 4);
});

test('bounds OAuth and REST requests with the same GitHub timeout', async () => {
    const requests = [];
    const axios = {
        async post(url, body, config) {
            requests.push({ method: 'post', url, config });
            return { data: { access_token: 'token' } };
        },
        async get(url, config) {
            requests.push({ method: 'get', url, config });
            return { data: { id: 1 } };
        }
    };
    const client = createGithubClient({ axios });

    await client.exchangeCode('code', 'verifier');
    await client.getAuthenticatedUser('token');
    await client.getUser('tester', 'token');

    assert.deepEqual(requests.map(({ config }) => config.timeout), [10_000, 10_000, 10_000]);
});

test('reports GitHub request timings without changing the response shape', async () => {
    const timings = [];
    const axios = {
        async post(url, body) {
            if (body.query?.includes('RepositoryData')) {
                return { data: { data: { user: {
                    starredRepositories: { totalCount: 0 },
                    repositories: { nodes: [] },
                    repositoriesContributedTo: { nodes: [] }
                } } } };
            }
            if (body.query?.includes('AnnualContributions')) {
                return { data: { data: { user: {
                    contributionsCollection: { contributionCalendar: { totalContributions: 0 } }
                } } } };
            }
            if (body.query?.includes('MergedPullRequests')) {
                return { data: { data: { user: { pullRequests: { nodes: [] } } } } };
            }
            return { data: { data: { user: {
                contributionsCollection: { contributionCalendar: { weeks: [] } }
            } } } };
        }
    };
    const client = createGithubClient({ axios, onRequestTiming: (event) => timings.push(event) });

    await client.getPlanetSource('tester', 'token');

    assert.deepEqual(timings.map(({ operation }) => operation), [
        'RepositoryData',
        'AnnualContributions',
        'MergedPullRequests',
        'RecentContributions',
        'get_planet_source'
    ]);
    assert.ok(timings.every(({ provider, outcome, durationMs }) => (
        provider === 'github' && outcome === 'success' && durationMs >= 0
    )));
});
