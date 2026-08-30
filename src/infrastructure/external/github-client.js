const REPOSITORY_DATA_QUERY = `
  query RepositoryData($login: String!) {
    user(login: $login) {
      starredRepositories { totalCount }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC}) {
        nodes {
          name
          stargazerCount
          languages(first: 5, orderBy: {field: SIZE, direction: DESC}) {
            edges { size node { name color } }
          }
        }
      }
      repositoriesContributedTo(first: 20, includeUserRepositories: false, contributionTypes: [COMMIT, PULL_REQUEST, PULL_REQUEST_REVIEW], privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC}) {
        nodes {
          name
          languages(first: 5, orderBy: {field: SIZE, direction: DESC}) {
            edges { size node { name color } }
          }
        }
      }
    }
  }
`;

const ANNUAL_CONTRIBUTIONS_QUERY = `
  query AnnualContributions($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar { totalContributions }
      }
    }
  }
`;

const RECENT_CONTRIBUTIONS_QUERY = `
  query RecentContributions($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          weeks { contributionDays { contributionCount date } }
        }
      }
    }
  }
`;

const MERGED_PULL_REQUESTS_QUERY = `
  query MergedPullRequests($login: String!) {
    user(login: $login) {
      pullRequests(first: 100, states: MERGED, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          repository { owner { login } }
        }
      }
    }
  }
`;

import { measureExternalOperation } from '../observability/external-performance.js';

const GITHUB_API_TIMEOUT_MS = 10_000;

export function createGithubClient({
    axios,
    clientId,
    clientSecret,
    callbackUrl,
    onRequestTiming,
    parallelPlanetSourceRequests = true
}) {
    async function requestGraphql(query, variables, accessToken) {
        const operation = query.match(/query (\w+)/)?.[1] || 'graphql';
        return measureExternalOperation(onRequestTiming, operation, async () => {
            const response = await axios.post('https://api.github.com/graphql', {
                query,
                variables
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: GITHUB_API_TIMEOUT_MS
            });
            if (response.data.errors) {
                console.error('[GraphQL Error]', response.data.errors);
                throw new Error('GraphQL query failed');
            }
            return response.data.data.user;
        }, { provider: 'github' });
    }

    return {
        async exchangeCode(code, codeVerifier) {
            return measureExternalOperation(onRequestTiming, 'exchange_code', async () => {
                const response = await axios.post('https://github.com/login/oauth/access_token', {
                    client_id: clientId,
                    client_secret: clientSecret,
                    code,
                    redirect_uri: callbackUrl,
                    code_verifier: codeVerifier
                }, {
                    headers: { Accept: 'application/json' },
                    timeout: GITHUB_API_TIMEOUT_MS
                });
                return response.data.access_token;
            }, { provider: 'github' });
        },

        async getAuthenticatedUser(accessToken) {
            return measureExternalOperation(onRequestTiming, 'get_authenticated_user', async () => {
                const response = await axios.get('https://api.github.com/user', {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    timeout: GITHUB_API_TIMEOUT_MS
                });
                return response.data;
            }, { provider: 'github' });
        },

        async getUser(username, accessToken) {
            return measureExternalOperation(onRequestTiming, 'get_user', async () => {
                const response = await axios.get(`https://api.github.com/users/${username}`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    timeout: GITHUB_API_TIMEOUT_MS
                });
                return response.data;
            }, { provider: 'github' });
        },

        async getPlanetSource(login, accessToken) {
            return measureExternalOperation(onRequestTiming, 'get_planet_source', async () => {
                const repositoryData = await requestGraphql(REPOSITORY_DATA_QUERY, { login }, accessToken);

                const to = new Date();
                const from = new Date(to);
                from.setDate(from.getDate() - 8);
                const recentQuery = () => requestGraphql(RECENT_CONTRIBUTIONS_QUERY, {
                    login,
                    from: from.toISOString(),
                    to: to.toISOString()
                }, accessToken);
                let annualData;
                let pullRequestData;
                let recentData;
                if (parallelPlanetSourceRequests) {
                    // 3つは読み取り専用で互いに依存しないため、直列待ちを避けても結果は同じ。
                    [annualData, pullRequestData, recentData] = await Promise.all([
                        requestGraphql(ANNUAL_CONTRIBUTIONS_QUERY, { login }, accessToken),
                        requestGraphql(MERGED_PULL_REQUESTS_QUERY, { login }, accessToken),
                        recentQuery()
                    ]);
                } else {
                    annualData = await requestGraphql(ANNUAL_CONTRIBUTIONS_QUERY, { login }, accessToken);
                    pullRequestData = await requestGraphql(MERGED_PULL_REQUESTS_QUERY, { login }, accessToken);
                    recentData = await recentQuery();
                }

                return {
                    ...repositoryData,
                    mergedPullRequests: pullRequestData.pullRequests?.nodes || [],
                    contributionsCollection: {
                        contributionCalendar: {
                            totalContributions: annualData.contributionsCollection?.contributionCalendar?.totalContributions || 0,
                            weeks: recentData.contributionsCollection?.contributionCalendar?.weeks || []
                        }
                    }
                };
            }, { provider: 'github' });
        }
    };
}
