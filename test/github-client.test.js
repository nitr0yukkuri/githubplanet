import assert from 'node:assert/strict';
import test from 'node:test';
import { createGithubClient } from '../src/infrastructure/external/github-client.js';

test('maps the GraphQL response into the application planet-source model', async () => {
    const requests = [];
    let activeRequests = 0;
    let maxConcurrentRequests = 0;
    const axios = {
        async post(url, body, config) {
            activeRequests += 1;
            maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests);
            await new Promise((resolve) => setImmediate(resolve));
            requests.push({ url, body, config });
            try {
                if (body.query.includes('RepositoryData')) {
                    return { data: { data: { user: {
                        starredRepositories: { totalCount: 4 },
                        repositories: { nodes: [{
                            name: 'owned',
                            stargazerCount: 3,
                            languages: { edges: [{ size: 70, node: { name: 'TypeScript' } }] }
                        }] },
                        repositoriesContributedTo: { nodes: [{
                            name: 'contributed',
                            languages: { edges: [{ size: 20, node: { name: 'CSS' } }] }
                        }] }
                    } } } };
                }
                if (body.query.includes('AnnualContributions')) {
                    return { data: { data: { user: {
                        contributionsCollection: { contributionCalendar: { totalContributions: 123 } }
                    } } } };
                }
                if (body.query.includes('MergedPullRequests')) {
                    return { data: { data: { user: {
                        pullRequests: { nodes: [{ repository: {
                            nameWithOwner: 'someone-else/project',
                            owner: { login: 'someone-else' }
                        } }] }
                    } } } };
                }
                return { data: { data: { user: {
                    contributionsCollection: {
                        contributionCalendar: {
                            weeks: [{ contributionDays: [{ contributionCount: 7, date: '2026-07-18' }] }]
                        }
                    }
                } } } };
            } finally {
                activeRequests -= 1;
            }
        }
    };
    const client = createGithubClient({ axios });

    const source = await client.getPlanetSource('tester', 'token');

    assert.equal(requests.length, 4);
    assert.equal(maxConcurrentRequests, 4);
    assert.deepEqual(requests.map(({ config }) => config.timeout), [10_000, 10_000, 10_000, 10_000]);
    assert.deepEqual(requests.map(({ body }) => body.variables.login), ['tester', 'tester', 'tester', 'tester']);
    assert.match(requests[2].body.query, /pullRequests\(first: 100, states: MERGED/);
    assert.match(requests[2].body.query, /repository \{ nameWithOwner owner \{ login \} \}/);
    assert.match(requests[3].body.variables.from, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(requests[3].body.variables.to, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(source, {
        ownedRepositories: [{ receivedStars: 3, languages: [{ language: 'TypeScript', bytes: 70 }] }],
        contributedRepositories: [{ languages: [{ language: 'CSS', bytes: 20 }] }],
        starredRepositoryCount: 4,
        mergedPullRequests: [{
            repositoryOwnerLogin: 'someone-else',
            repositoryNameWithOwner: 'someone-else/project'
        }],
        totalContributions: 123,
        dailyContributions: [{ count: 7, date: '2026-07-18' }]
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

    assert.deepEqual(timings.map(({ operation }) => operation).sort(), [
        'RepositoryData',
        'AnnualContributions',
        'MergedPullRequests',
        'RecentContributions',
        'get_planet_source'
    ].sort());
    assert.ok(timings.every(({ provider, outcome, durationMs }) => (
        provider === 'github' && outcome === 'success' && durationMs >= 0
    )));
});

test('gets a public GitHub profile without sending an empty bearer token', async () => {
    let request;
    const client = createGithubClient({
        axios: {
            async get(url, config) {
                request = { url, config };
                return { data: { id: 42, login: 'alice' } };
            }
        }
    });

    assert.deepEqual(await client.getUser('alice'), { id: 42, login: 'alice' });
    assert.equal(request.url, 'https://api.github.com/users/alice');
    assert.equal(request.config.headers.Authorization, undefined);
    assert.equal(request.config.headers.Accept, 'application/vnd.github+json');
});

test('gets a public GitHub profile by immutable account ID', async () => {
    let request;
    const client = createGithubClient({
        githubApiBaseUrl: 'https://github-api.example.test',
        axios: {
            async get(url, config) {
                request = { url, config };
                return { data: { id: 76643867, login: 'renamed-user' } };
            }
        }
    });

    assert.deepEqual(await client.getUserById(76643867, 'token'), {
        id: 76643867,
        login: 'renamed-user'
    });
    assert.equal(request.url, 'https://github-api.example.test/user/76643867');
    assert.equal(request.config.headers.Authorization, 'Bearer token');
    assert.equal(request.config.headers.Accept, 'application/vnd.github+json');
});
