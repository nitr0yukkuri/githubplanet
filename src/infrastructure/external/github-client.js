const USER_DATA_QUERY = `
  query($login: String!) {
    user(login: $login) {
      starredRepositories { totalCount }
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { contributionCount date } }
        }
      }
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

export function createGithubClient({ axios, clientId, clientSecret, callbackUrl }) {
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
            const response = await axios.post('https://api.github.com/graphql', {
                query: USER_DATA_QUERY,
                variables: { login }
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
    };
}
