import assert from 'node:assert/strict';
import test from 'node:test';
import { createGithubClient } from '../src/infrastructure/external/github-client.js';

test('splits planet data into bounded GraphQL requests and preserves the existing source shape', async () => {
    const requests = [];
    const axios = {
        async post(url, body) {
            requests.push({ url, body });
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

    assert.equal(requests.length, 3);
    assert.deepEqual(requests.map(({ body }) => body.variables.login), ['tester', 'tester', 'tester']);
    assert.match(requests[2].body.variables.from, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(requests[2].body.variables.to, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(source, {
        starredRepositories: { totalCount: 4 },
        repositories: { nodes: [{ name: 'owned' }] },
        repositoriesContributedTo: { nodes: [{ name: 'contributed' }] },
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
    assert.equal(calls, 2);
});
