import process from 'node:process';

const target = new URL(process.argv[2] || 'http://127.0.0.1:3000/api/planets/random');
const warmupCount = Number.parseInt(process.argv[3] || '10', 10);
const sampleCount = Number.parseInt(process.argv[4] || '100', 10);
const cookieMode = process.argv[5] || 'session';

if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname)) {
    throw new Error('Safety check failed: this script only allows localhost targets.');
}
if (!Number.isInteger(warmupCount) || warmupCount < 0) {
    throw new Error('Warmup count must be a non-negative integer.');
}
if (!Number.isInteger(sampleCount) || sampleCount < 100) {
    throw new Error('Sample count must be at least 100.');
}
if (!['session', 'fresh'].includes(cookieMode)) {
    throw new Error('Cookie mode must be either "session" or "fresh".');
}

let cookie;

function updateCookie(response) {
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';', 1)[0];
}

async function request() {
    const startedAt = performance.now();
    const response = await fetch(target, {
        headers: cookieMode === 'session' && cookie ? { cookie } : undefined
    });
    if (cookieMode === 'session') updateCookie(response);
    await response.arrayBuffer();
    return {
        durationMs: performance.now() - startedAt,
        status: response.status
    };
}

for (let index = 0; index < warmupCount; index += 1) {
    await request();
}

const samples = [];
for (let index = 0; index < sampleCount; index += 1) {
    samples.push(await request());
}

const durations = samples.map(({ durationMs }) => durationMs).sort((a, b) => a - b);
const percentile = (ratio) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * ratio) - 1)];
const total = durations.reduce((sum, duration) => sum + duration, 0);
const statusCounts = Object.fromEntries(
    [...new Set(samples.map(({ status }) => status))]
        .sort((a, b) => a - b)
        .map((status) => [status, samples.filter((sample) => sample.status === status).length])
);

console.log(JSON.stringify({
    target: target.toString(),
    warmup: warmupCount,
    samples: sampleCount,
    cookieMode,
    httpMs: {
        min: durations[0],
        median: percentile(0.5),
        average: total / durations.length,
        p95: percentile(0.95),
        p99: percentile(0.99),
        max: durations[durations.length - 1]
    },
    statusCounts
}, null, 2));
