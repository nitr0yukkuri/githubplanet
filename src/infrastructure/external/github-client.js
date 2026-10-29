const REPOSITORY_DATA_QUERY = `
  query RepositoryData($login: String!) {
    user(login: $login) {
      starredRepositories { totalCount }
      repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC}) {
        nodes {
          name
          isFork
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
          repository { nameWithOwner owner { login } }
        }
      }
    }
  }
`;

import { measureExternalOperation } from '../observability/external-performance.js';
import { createGithubAuthoredLanguageHistoryClient } from './github-authored-language-history.js';
import { EXTENSION_MAP } from '../../domain/planet/language-extensions.js';

const GITHUB_API_TIMEOUT_MS = 10_000;

function endpoint(baseUrl, pathname) {
    return new URL(pathname, `${baseUrl.replace(/\/+$/, '')}/`).href;
}

function mapRepositories(connection, { includeStars = false } = {}) {
    return (connection?.nodes || []).map((repository) => ({
        languages: (repository.languages?.edges || []).map((edge) => ({
            language: edge.node?.name || 'Unknown',
            bytes: edge.size || 0
        })),
        ...(includeStars ? { receivedStars: repository.isFork ? 0 : repository.stargazerCount || 0 } : {})
    }));
}

function mapPlanetSource(repositoryData, annualData, pullRequestData, recentData) {
    const calendar = annualData.contributionsCollection?.contributionCalendar;
    const recentCalendar = recentData.contributionsCollection?.contributionCalendar;
    const dailyContributions = (recentCalendar?.weeks || []).flatMap((week) => (
        (week.contributionDays || []).map((day) => ({ date: day.date, count: day.contributionCount }))
    ));

    // GraphQL connection/edge構造は外部境界で平坦化し、集計側をAPIスキーマ変更から分離する。
    return {
        ownedRepositories: mapRepositories(repositoryData.repositories, { includeStars: true }),
        contributedRepositories: mapRepositories(repositoryData.repositoriesContributedTo),
        starredRepositoryCount: repositoryData.starredRepositories?.totalCount || 0,
        mergedPullRequests: (pullRequestData.pullRequests?.nodes || []).map(({ repository }) => ({
            repositoryOwnerLogin: repository?.owner?.login || null,
            repositoryNameWithOwner: repository?.nameWithOwner || null
        })),
        totalContributions: calendar?.totalContributions || 0,
        dailyContributions
    };
}

export function createGithubClient({
    axios,
    clientId,
    clientSecret,
    callbackUrl,
    onRequestTiming,
    parallelPlanetSourceRequests = true,
    publicRequestGate,
    githubApiBaseUrl = 'https://api.github.com',
    githubOAuthBaseUrl = 'https://github.com'
}) {
    const appAuth = clientId && clientSecret ? { username: clientId, password: clientSecret } : undefined;
    async function publicRestGet(pathname, { accessToken, params } = {}) {
        const operation = () => axios.get(endpoint(githubApiBaseUrl, pathname), {
            ...(params ? { params } : {}),
            headers: { Accept: 'application/vnd.github+json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
            ...(!accessToken && appAuth ? { auth: appAuth } : {}),
            timeout: GITHUB_API_TIMEOUT_MS
        });
        try { return await (!accessToken && publicRequestGate ? publicRequestGate.run(operation) : operation()); }
        catch (error) {
            const headers = error.response?.headers || {};
            if (error.response?.status === 429 || (error.response?.status === 403
                && (String(headers['x-ratelimit-remaining']) === '0' || headers['retry-after']))) {
                error.code = 'GITHUB_RATE_LIMITED';
            }
            throw error;
        }
    }
    const authoredLanguageHistoryClient = createGithubAuthoredLanguageHistoryClient({
        axios,
        extensionMap: EXTENSION_MAP,
        onRequestTiming
    });

    async function requestGraphql(query, variables, accessToken) {
        const operation = query.match(/query (\w+)/)?.[1] || 'graphql';
        return measureExternalOperation(onRequestTiming, operation, async () => {
            const response = await axios.post(endpoint(githubApiBaseUrl, '/graphql'), {
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
                console.error('[GraphQL Error]', { errorCount: Array.isArray(response.data.errors) ? response.data.errors.length : 1 });
                throw new Error('GraphQL query failed');
            }
            return response.data.data.user;
        }, { provider: 'github' });
    }

    return {
        scanHistoricalAuthoredLanguageCommits: authoredLanguageHistoryClient.scanHistoricalAuthoredLanguageCommits,
        async exchangeCode(code, codeVerifier) {
            return measureExternalOperation(onRequestTiming, 'exchange_code', async () => {
                const response = await axios.post(endpoint(githubOAuthBaseUrl, '/login/oauth/access_token'), {
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
                const response = await axios.get(endpoint(githubApiBaseUrl, '/user'), {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    timeout: GITHUB_API_TIMEOUT_MS
                });
                return response.data;
            }, { provider: 'github' });
        },

        async getUser(username, accessToken) {
            return measureExternalOperation(onRequestTiming, 'get_user', async () => {
                const response = await publicRestGet(`/users/${encodeURIComponent(username)}`, { accessToken });
                return response.data;
            }, { provider: 'github' });
        },

        async getUserById(accountId, accessToken) {
            return measureExternalOperation(onRequestTiming, 'get_user_by_id', async () => {
                const normalizedAccountId = String(accountId ?? '').trim();
                if (!/^[1-9]\d*$/.test(normalizedAccountId)) {
                    throw new TypeError('Invalid GitHub account ID');
                }
                const response = await publicRestGet(`/user/${encodeURIComponent(normalizedAccountId)}`, { accessToken });
                return response.data;
            }, { provider: 'github' });
        },

        async getPublicPlanetSource(username) {
            return measureExternalOperation(onRequestTiming, 'get_public_planet_source', async () => {
                try {
                    const response = await publicRestGet(`/users/${encodeURIComponent(username)}/repos`, {
                        params: { per_page: 100, sort: 'updated', type: 'owner' }
                    });
                    const repositories = Array.isArray(response.data) ? response.data : [];
                    return {
                        username: repositories[0]?.owner?.login || username,
                        ownedRepositories: repositories.map((repository) => ({
                            languages: repository.language
                                ? [{ language: repository.language, bytes: Math.max(1, Number(repository.size) || 1) * 1024 }]
                                : [],
                            receivedStars: repository.fork ? 0 : Number(repository.stargazers_count) || 0
                        })),
                        contributedRepositories: [],
                        starredRepositoryCount: 0,
                        mergedPullRequests: [],
                        totalContributions: 0,
                        dailyContributions: []
                    };
                } catch (error) {
                    const status = error.response?.status;
                    const retryAfterSeconds = Number(
                        error.response?.headers?.['retry-after']
                        || error.response?.headers?.['Retry-After']
                    );
                    const resetAt = Number(
                        error.response?.headers?.['x-ratelimit-reset']
                        || error.response?.headers?.['X-RateLimit-Reset']
                    ) * 1000;
                    if ([403, 429].includes(status)) {
                        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
                            error.retryAfterMs = retryAfterSeconds * 1000;
                        } else if (Number.isFinite(resetAt) && resetAt > Date.now()) {
                            error.retryAfterMs = resetAt - Date.now();
                        }
                    }
                    throw error;
                }
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

                return mapPlanetSource(repositoryData, annualData, pullRequestData, recentData);
            }, { provider: 'github' });
        }
    };
}
