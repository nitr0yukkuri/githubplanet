import { spawn } from 'node:child_process';
import process from 'node:process';

const basePort = Number.parseInt(process.argv[2] || '3210', 10);
const warmupCount = Number.parseInt(process.argv[3] || '10', 10);
const sampleCount = Number.parseInt(process.argv[4] || '100', 10);
const databaseUrl = process.env.RANDOM_PERF_DATABASE_URL;

if (!Number.isInteger(basePort) || basePort < 1024 || basePort > 65500) {
    throw new Error('Base port must be an integer between 1024 and 65500.');
}
if (!Number.isInteger(warmupCount) || warmupCount < 0) {
    throw new Error('Warmup count must be a non-negative integer.');
}
if (!Number.isInteger(sampleCount) || sampleCount < 100) {
    throw new Error('Sample count must be at least 100.');
}
if (!databaseUrl) {
    throw new Error('RANDOM_PERF_DATABASE_URL must point to a disposable local PostgreSQL database.');
}

let database;
try {
    database = new URL(databaseUrl);
} catch {
    throw new Error('RANDOM_PERF_DATABASE_URL is not a valid PostgreSQL URL.');
}
if (
    !['postgres:', 'postgresql:'].includes(database.protocol)
    || !['localhost', '127.0.0.1', '::1'].includes(database.hostname)
) {
    throw new Error('Safety check failed: RANDOM_PERF_DATABASE_URL must use localhost PostgreSQL.');
}

function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function percentile(sortedDurations, ratio) {
    return sortedDurations[Math.min(
        sortedDurations.length - 1,
        Math.ceil(sortedDurations.length * ratio) - 1
    )];
}

function summarizeDurations(values) {
    if (values.length === 0) return null;
    const durations = values.filter(Number.isFinite).sort((a, b) => a - b);
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    return {
        min: durations[0],
        median: percentile(durations, 0.5),
        average: total / durations.length,
        p95: percentile(durations, 0.95),
        p99: percentile(durations, 0.99),
        max: durations[durations.length - 1]
    };
}

function startServer(mode, port) {
    const child = spawn(process.execPath, ['server.js'], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            PORT: String(port),
            DATABASE_URL: databaseUrl,
            NODE_ENV: 'test',
            PERF_TRACE_RANDOM: 'true',
            RANDOM_HISTORY_STORAGE: mode
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const events = [];
    let output = '';
    let ready = false;
    let lineBuffer = '';

    function consume(chunk) {
        const text = chunk.toString();
        output += text;
        lineBuffer += text;
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop() || '';
        for (const line of lines) {
            const marker = '[Random Performance] ';
            const markerIndex = line.indexOf(marker);
            if (markerIndex === -1) continue;
            try {
                events.push(JSON.parse(line.slice(markerIndex + marker.length)));
            } catch {
                // Ignore a partial or unrelated diagnostic line.
            }
        }
        if (output.includes('Server running on port')) ready = true;
    }

    child.stdout.on('data', consume);
    child.stderr.on('data', consume);

    const readyPromise = new Promise((resolve, reject) => {
        const deadline = setTimeout(() => {
            reject(new Error(`Server startup timed out for ${mode}: ${output}`));
        }, 30_000);
        const check = () => {
            if (!ready) return;
            clearTimeout(deadline);
            resolve();
        };
        child.stdout.on('data', check);
        child.stderr.on('data', check);
        child.once('error', (error) => {
            clearTimeout(deadline);
            reject(error);
        });
        child.once('exit', (code) => {
            if (ready) return;
            clearTimeout(deadline);
            reject(new Error(`Server exited before startup with code ${code}: ${output}`));
        });
    });

    return { child, events, readyPromise };
}

async function stopServer(server) {
    if (!server || server.child.exitCode !== null) return;
    server.child.kill();
    await Promise.race([
        new Promise((resolve) => server.child.once('exit', resolve)),
        sleep(5_000)
    ]);
    if (server.child.exitCode === null) server.child.kill('SIGKILL');
}

async function benchmark(baseUrl) {
    let cookie;

    const updateCookie = (response) => {
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';', 1)[0];
    };
    const request = async () => {
        const startedAt = performance.now();
        const response = await fetch(`${baseUrl}/api/planets/random`, {
            headers: cookie ? { cookie } : undefined
        });
        updateCookie(response);
        await response.arrayBuffer();
        return {
            durationMs: performance.now() - startedAt,
            status: response.status
        };
    };

    for (let index = 0; index < warmupCount; index += 1) await request();
    const samples = [];
    for (let index = 0; index < sampleCount; index += 1) samples.push(await request());

    const statusCounts = Object.fromEntries(
        [...new Set(samples.map((sample) => sample.status))]
            .sort((a, b) => a - b)
            .map((status) => [status, samples.filter((sample) => sample.status === status).length])
    );
    return {
        durations: samples.map((sample) => sample.durationMs),
        statusCounts
    };
}

function summarizeServerEvents(events) {
    const requests = events.filter((event) => event.event === 'random_request');
    const queries = events.filter((event) => event.event === 'random_sql');
    const saves = requests.flatMap((event) => event.sessionSave || []);
    const queryStrategyCounts = Object.fromEntries(
        [...new Set(queries.map((event) => event.strategy || 'unknown'))]
            .sort()
            .map((strategy) => [
                strategy,
                queries.filter((event) => (event.strategy || 'unknown') === strategy).length
            ])
    );
    return {
        requestEvents: requests.length,
        sqlEvents: queries.length,
        http: summarizeDurations(requests.map((event) => event.httpMs)),
        sessionLoad: summarizeDurations(requests.map((event) => event.sessionLoadMs)),
        sessionSave: summarizeDurations(saves.map((event) => event.durationMs)),
        sessionSaveCount: saves.length,
        sqlRoundTrip: summarizeDurations(queries.map((event) => event.dbRoundTripMs)),
        queryStrategyCounts,
        sessionStoreCookieRequests: requests.filter((event) => event.sessionStoreCookiePresent).length,
        randomHistoryCookieRequests: requests.filter((event) => event.randomHistoryCookiePresent).length
    };
}

function summarizeRun(result) {
    return {
        http: summarizeDurations(result.httpDurations),
        statusCounts: result.statusCounts,
        server: summarizeServerEvents(result.serverEvents)
    };
}

function compareRuns(optimized, baseline) {
    return {
        httpP95DeltaMs: delta(optimized.http?.p95, baseline.http?.p95),
        serverHttpP95DeltaMs: delta(optimized.server.http?.p95, baseline.server.http?.p95),
        sessionLoadP95DeltaMs: delta(
            optimized.server.sessionLoad?.p95,
            baseline.server.sessionLoad?.p95
        ),
        sessionSaveCountDelta: optimized.server.sessionSaveCount - baseline.server.sessionSaveCount,
        sqlP95DeltaMs: delta(
            optimized.server.sqlRoundTrip?.p95,
            baseline.server.sqlRoundTrip?.p95
        )
    };
}

async function runMode(mode, port) {
    const server = startServer(mode, port);
    try {
        await server.readyPromise;
        const benchmarkResult = await benchmark(`http://127.0.0.1:${port}`);
        await sleep(100);
        return {
            httpDurations: benchmarkResult.durations,
            statusCounts: benchmarkResult.statusCounts,
            serverEvents: server.events
        };
    } finally {
        await stopServer(server);
    }
}

const delta = (optimized, baseline) => (
    Number.isFinite(optimized) && Number.isFinite(baseline)
        ? optimized - baseline
        : null
);

const orders = [
    ['session', 'cookie'],
    ['cookie', 'session']
];
const rounds = [];

for (let roundIndex = 0; roundIndex < orders.length; roundIndex += 1) {
    const [firstMode, secondMode] = orders[roundIndex];
    const first = await runMode(firstMode, basePort + roundIndex * 2);
    const second = await runMode(secondMode, basePort + roundIndex * 2 + 1);
    const rawModes = { [firstMode]: first, [secondMode]: second };
    const legacySession = summarizeRun(rawModes.session);
    const cookieOptimized = summarizeRun(rawModes.cookie);
    rounds.push({
        order: `${firstMode} -> ${secondMode}`,
        valid: isValid(legacySession) && isValid(cookieOptimized),
        modes: { legacySession, cookieOptimized },
        comparison: compareRuns(cookieOptimized, legacySession)
    });
}

function isValid(result) {
    return result.statusCounts['200'] === sampleCount
        && result.server.requestEvents >= sampleCount
        && result.server.sqlEvents >= sampleCount;
}

console.log(JSON.stringify({
    databaseHost: database.hostname,
    databasePort: database.port || '5432',
    warmup: warmupCount,
    samples: sampleCount,
    valid: rounds.every((round) => round.valid),
    rounds
}, null, 2));
