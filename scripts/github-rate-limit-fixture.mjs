import express from 'express';
import session from 'express-session';
import { createGithubClient } from '../src/infrastructure/external/github-client.js';
import { registerPlanetRoutes } from '../src/presentation/http/planet-routes.js';

const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.FIXTURE_PORT || '4176', 10);
const CACHE_DURATION_MS = 60_000;
const MOCK_DELAY_MS = Math.min(1_000, Math.max(0, Number(process.env.MOCK_GITHUB_DELAY_MS) || 25));
const ALLOWED_MODES = new Set(['success', 'refresh429', 'graphql-error', 'random']);

const counters = {
    githubRequests: 0,
    githubRateLimited: 0,
    githubByMode: {},
    githubByOperation: {},
    apiByPath: {},
    apiByStatus: {}
};

function resetCounters() {
    counters.githubRequests = 0;
    counters.githubRateLimited = 0;
    counters.githubByMode = {};
    counters.githubByOperation = {};
    counters.apiByPath = {};
    counters.apiByStatus = {};
}

function getModeFromToken(token) {
    const [, mode = 'success'] = String(token || '').split(':');
    return ALLOWED_MODES.has(mode) ? mode : 'success';
}

function rateLimitHeaders() {
    return {
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Math.ceil(Date.now() / 1_000) + 30),
        'retry-after': '30'
    };
}

function rateLimitError() {
    const error = new Error('Fixture GitHub API rate limit reached');
    error.response = {
        status: 429,
        headers: rateLimitHeaders(),
        data: { message: 'Fixture rate limit reached' }
    };
    return error;
}

function successData(operation, query) {
    if (operation === 'RepositoryData') {
        return {
            starredRepositories: { totalCount: 3 },
            repositories: { nodes: [] },
            pinnedItems: { nodes: [] },
            repositoriesContributedTo: { nodes: [] }
        };
    }
    if (operation === 'AnnualContributions') {
        return { contributionsCollection: { contributionCalendar: { totalContributions: 12 } } };
    }
    if (operation === 'MergedPullRequests') return { pullRequests: { nodes: [] } };
    if (operation === 'RecentContributions') {
        return { contributionsCollection: { contributionCalendar: { weeks: [] } } };
    }
    if (operation === 'HistoricalContributionCalendar') {
        return Object.fromEntries(
            [...String(query).matchAll(/year(\d{4}): contributionsCollection/g)]
                .map(([, year]) => [`year${year}`, { contributionCalendar: { weeks: [] } }])
        );
    }
    return {};
}

async function mockedGithubRequest(url, operation, token, query) {
    if (!String(url).startsWith('https://api.github.com/')) {
        throw new Error(`Fixture blocked non-GitHub API request: ${url}`);
    }

    const mode = getModeFromToken(token);
    counters.githubRequests += 1;
    counters.githubByMode[mode] = (counters.githubByMode[mode] || 0) + 1;
    counters.githubByOperation[operation] = (counters.githubByOperation[operation] || 0) + 1;
    if (MOCK_DELAY_MS) await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

    if (mode === 'refresh429') {
        counters.githubRateLimited += 1;
        throw rateLimitError();
    }
    if (mode === 'graphql-error') {
        return {
            status: 200,
            headers: { ...rateLimitHeaders(), 'x-ratelimit-remaining': '4999' },
            data: {
                data: { user: null },
                errors: [{ type: 'RATE_LIMITED', message: 'Fixture secondary rate limit' }]
            }
        };
    }

    return {
        status: 200,
        headers: { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4999' },
        data: { data: { user: successData(operation, query) } }
    };
}

const axios = {
    async post(url, body, config = {}) {
        if (url !== 'https://api.github.com/graphql') {
            throw new Error(`Fixture blocked outbound POST: ${url}`);
        }
        const operation = String(body?.query || '').match(/query\s+(\w+)/)?.[1] || 'graphql';
        const token = String(config.headers?.Authorization || '').replace(/^Bearer\s+/i, '');
        return mockedGithubRequest(url, operation, token, body?.query);
    },
    async get(url, config = {}) {
        if (!String(url).startsWith('https://api.github.com/')) {
            throw new Error(`Fixture blocked outbound GET: ${url}`);
        }
        const operation = url.slice('https://api.github.com/'.length).replaceAll('/', '_');
        const token = String(config.headers?.Authorization || '').replace(/^Bearer\s+/i, '');
        return mockedGithubRequest(url, operation, token);
    }
};

const githubClient = createGithubClient({ axios });
const planetRow = {
    githubId: 'fixture-planet',
    username: 'fixture-planet',
    planetColor: '#f0db4f',
    planetSizeFactor: 0.25,
    mainLanguage: 'JavaScript',
    languageStats: { JavaScript: 1 },
    featuredProjects: [],
    totalCommits: 7,
    weeklyCommits: 2,
    planetName: 'Fixture Planet',
    achievements: {},
    activeTitle: { prefix: '名もなき', suffix: '旅人' }
};

const planetQueryService = {
    async getRandom() { return planetRow; },
    async getByUsername() { return planetRow; },
    async getHistoryByGithubId() { return []; },
    async getContributionActivityHistory() { return []; },
    async saveContributionHistory() { return null; },
    async startAuthoredLanguageHistoryScan() { return false; },
    async getAuthoredLanguageHistory() {
        return { history: [], status: { state: 'idle', ready: false, partial: false } };
    },
    async getPublicHistoryByUsername() {
        return { history: [], activityHistory: [], authoredLanguageHistory: [], authoredLanguageHistoryStatus: { state: 'idle' } };
    },
    async saveActiveTitle() { return true; }
};

const app = express();
app.use(express.json());
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        counters.apiByPath[req.path] = (counters.apiByPath[req.path] || 0) + 1;
        res.once('finish', () => {
            const key = `${req.path}:${res.statusCode}`;
            counters.apiByStatus[key] = (counters.apiByStatus[key] || 0) + 1;
        });
    }
    next();
});
app.use(session({
    name: 'github-rate-fixture.sid',
    secret: 'fixture-only-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' }
}));

app.get('/__fixture/health', (req, res) => {
    res.json({ ok: true, outboundGithubNetwork: 'disabled', host: HOST, port: PORT });
});

app.post('/__fixture/reset', (req, res) => {
    resetCounters();
    res.json({ ok: true });
});

app.get('/__fixture/session', (req, res) => {
    const mode = String(req.query.mode || 'success');
    const userId = String(req.query.user || '1').replace(/[^\w-]/g, '').slice(0, 40) || '1';
    if (!ALLOWED_MODES.has(mode)) return res.status(400).json({ error: 'Unknown fixture mode' });

    req.session.github_token = `fixture:${mode}:${userId}`;
    req.session.last_updated = Date.now() - CACHE_DURATION_MS * 2;
    req.session.planetData = {
        user: {
            id: userId,
            login: `fixture-${userId}`,
            created_at: '2017-01-01T00:00:00Z'
        },
        planetData: { ...planetRow }
    };
    res.json({ ok: true, mode, userId });
});

app.get('/__fixture/metrics', (req, res) => {
    res.json({
        outboundGithubNetwork: 'disabled; responses are generated in this process',
        githubRequests: counters.githubRequests,
        githubRateLimited: counters.githubRateLimited,
        githubByMode: counters.githubByMode,
        githubByOperation: counters.githubByOperation,
        apiByPath: counters.apiByPath,
        apiByStatus: counters.apiByStatus
    });
});

registerPlanetRoutes(app, {
    planetQueryService,
    planetService: {
        async updateAndSavePlanetData(user, accessToken) {
            const source = await githubClient.getPlanetSource(user.login, accessToken);
            return {
                ...planetRow,
                username: user.login,
                totalCommits: source.contributionCalendar.totalContributions,
                weeklyCommits: 0,
                ownedRepositories: source.ownedRepositories,
                featuredProjects: source.featuredProjects,
                contributionCalendar: source.contributionCalendar
            };
        }
    },
    cacheDuration: CACHE_DURATION_MS,
    randomHistoryStorage: 'cookie'
});

app.listen(PORT, HOST, () => {
    console.log(`GitHub rate-limit fixture listening on http://${HOST}:${PORT}`);
    console.log('Outbound GitHub network requests are blocked; all API responses are synthetic.');
});
