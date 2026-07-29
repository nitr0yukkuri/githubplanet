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

export function createGithubClient({ axios, clientId, clientSecret, callbackUrl }) {
    async function requestGraphql(query, variables, accessToken) {
        const response = await axios.post('https://api.github.com/graphql', {
            query,
            variables
        }, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        if (response.data.errors) {
            console.error('[GraphQL Error]', response.data.errors);
            throw new Error('GraphQL query failed');
        }
        return response.data.data.user;
    }

    return {
        async exchangeCode(code, codeVerifier) {
            const response = await axios.post('https://github.com/login/oauth/access_token', {
                client_id: clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: callbackUrl,
                code_verifier: codeVerifier
            }, { headers: { Accept: 'application/json' } });
            return response.data.access_token;
        },

        async getAuthenticatedUser(accessToken) {
            const response = await axios.get('https://api.github.com/user', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            return response.data;
        },

        async getUser(username, accessToken) {
            const response = await axios.get(`https://api.github.com/users/${username}`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            return response.data;
        },

        async getPlanetSource(login, accessToken) {
            const repositoryData = await requestGraphql(REPOSITORY_DATA_QUERY, { login }, accessToken);
            const annualData = await requestGraphql(ANNUAL_CONTRIBUTIONS_QUERY, { login }, accessToken);
            const pullRequestData = await requestGraphql(MERGED_PULL_REQUESTS_QUERY, { login }, accessToken);

            const to = new Date();
            const from = new Date(to);
            from.setDate(from.getDate() - 8);
            const recentData = await requestGraphql(RECENT_CONTRIBUTIONS_QUERY, {
                login,
                from: from.toISOString(),
                to: to.toISOString()
            }, accessToken);

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
        }
    };
}
