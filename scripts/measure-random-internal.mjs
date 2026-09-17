import express from 'express';
import session from 'express-session';
import { registerPlanetRoutes } from '../src/presentation/http/planet-routes.js';
import { createRandomPerformanceReporter } from '../src/presentation/http/random-performance.js';

const sampleCount = Number.parseInt(process.argv[2] || '100', 10);
const warmupCount = Number.parseInt(process.argv[3] || '20', 10);
const queryDelayMs = Number.parseFloat(process.argv[4] || '2');

if (!Number.isInteger(sampleCount) || sampleCount < 100) {
    throw new Error('Sample count must be at least 100.');
}
if (!Number.isInteger(warmupCount) || warmupCount < 0) {
    throw new Error('Warmup count must be a non-negative integer.');
}
if (!Number.isFinite(queryDelayMs) || queryDelayMs < 0) {
    throw new Error('Query delay must be a non-negative number.');
}

const row = {
    github_id: 1001,
    username: 'internal-perf',
    main_language: 'JavaScript',
    planet_color: '#f0db4f',
    language_stats: { JavaScript: 120000 },
    total_commits: 240,
    weekly_commits: 12,
    planet_size_factor: '1',
    planet_name: '測定惑星',
    achievements: {},
    active_title: { prefix: '名もなき', suffix: '旅人' }
};

function percentile(values, ratio) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] || 0;
}

function summarize(values) {
    return {
        medianMs: percentile(values, 0.5),
        averageMs: values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1),
        p95Ms: percentile(values, 0.95),
        p99Ms: percentile(values, 0.99),
        maxMs: Math.max(...values, 0)
    };
}

async function measureScenario(randomHistoryStorage, port) {
    const logs = [];
    let queryCount = 0;
    const reporter = createRandomPerformanceReporter({
        enabled: true,
        logger: (message) => logs.push(message)
    });
    const app = express();
    app.use(reporter.startMiddleware);
    app.use(reporter.beforeSessionMiddleware);
    app.use(session({
        secret: 'random-internal-perf',
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: 'lax' }
    }));
    app.use(reporter.middleware);
    registerPlanetRoutes(app, {
        planetService: {},
        planetQueryService: {
            async getRandom() {
                queryCount += 1;
                await new Promise((resolve) => setTimeout(resolve, queryDelayMs));
                return { ...row, github_id: row.github_id + queryCount };
            }
        },
        cacheDuration: 60_000,
        randomHistoryStorage,
        randomPerformance: reporter
    });

    const server = await new Promise((resolve) => {
        const instance = app.listen(port, '127.0.0.1', () => resolve(instance));
    });
    let cookie;

    async function request() {
        const response = await fetch(`http://127.0.0.1:${port}/api/planets/random`, {
            headers: cookie ? { cookie } : undefined
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';', 1)[0];
        await response.arrayBuffer();
        return response.status;
    }

    try {
        for (let index = 0; index < warmupCount; index += 1) await request();
        const statuses = [];
        for (let index = 0; index < sampleCount; index += 1) {
            statuses.push(await request());
        }

        const requests = logs
            .map((message) => JSON.parse(message.replace('[Random Performance] ', '')))
            .filter((event) => event.event === 'random_request');
        const stageValues = (stage) => requests.flatMap((event) => (
            event.routeStages
                .filter((item) => item.stage === stage)
                .map((item) => item.durationMs)
        ));
        const stageNames = [
            'route-entered',
            'history-resolved',
            'query-start',
            'query-complete',
            'history-stored',
            'response-serialized'
        ];

        return {
            storage: randomHistoryStorage,
            sampleCount,
            warmupCount,
            queryDelayMs,
            statusCounts: Object.fromEntries([...new Set(statuses)].map((status) => [
                status,
                statuses.filter((value) => value === status).length
            ])),
            http: summarize(requests.map((event) => event.httpMs)),
            sessionLoad: summarize(requests.map((event) => event.sessionLoadMs)),
            sessionSave: summarize(requests.flatMap((event) => (
                event.sessionSave.map((save) => save.durationMs)
            ))),
            sessionSaveCount: requests.reduce((sum, event) => sum + event.sessionSave.length, 0),
            routeStages: Object.fromEntries(stageNames.map((stage) => [stage, summarize(stageValues(stage))]))
        };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

const portBase = 3230;
const results = [
    await measureScenario('cookie', portBase),
    await measureScenario('session', portBase + 1)
];

console.log(JSON.stringify({
    environment: {
        target: '127.0.0.1 disposable Express app',
        externalCalls: false,
        database: false,
        note: 'queryDelayMs is a controlled stand-in for the repository await; route stages are real.'
    },
    results
}, null, 2));
