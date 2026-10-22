import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:4176').replace(/\/+$/, '');
const mode = __ENV.MODE || 'refresh429';
const profile = __ENV.PROFILE || 'steady';
const vus = Math.min(800, Math.max(1, Number(__ENV.VUS || 5)));
const maxVus = Math.min(800, Math.max(1, Number(__ENV.MAX_VUS || 800)));
const duration = __ENV.DURATION || '12s';
const thinkTime = Math.max(0, Number(__ENV.THINK_TIME_SECONDS || 1));
const allowedModes = new Set(['success', 'refresh429', 'graphql-error', 'random']);
const failures = new Rate('github_fixture_app_errors');
const responseDuration = new Trend('github_fixture_app_duration', true);
let initialized = false;
let fixtureCookie = '';

if (!isLocalUrl(baseUrl)) {
  throw new Error(`This fixture test only accepts a local BASE_URL: ${baseUrl}`);
}
if (!allowedModes.has(mode)) {
  throw new Error(`Unsupported MODE: ${mode}`);
}
if (!new Set(['steady', 'breakpoint']).has(profile)) {
  throw new Error(`Unsupported PROFILE: ${profile}`);
}

const isBreakpoint = profile === 'breakpoint';
const breakpointTargets = [10, 25, 50, 100, 200, 400, 800]
  .filter((target) => target <= maxVus);
if (breakpointTargets.at(-1) !== maxVus) breakpointTargets.push(maxVus);
const scenarios = isBreakpoint
  ? {
      github_rate_limit_breakpoint: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages: [
          ...breakpointTargets.map((target) => ({ duration: '8s', target })),
          { duration: '4s', target: 0 },
        ],
        gracefulRampDown: '3s',
      },
    }
  : {
      github_rate_limit_fixture: {
        executor: 'constant-vus',
        vus,
        duration,
        gracefulStop: '2s',
      },
    };

const failureThreshold = isBreakpoint
  ? [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '3s' }]
  : ['rate<0.01'];
const latencyThreshold = isBreakpoint
  ? [{ threshold: 'p(95)<1500', abortOnFail: true, delayAbortEval: '3s' }]
  : ['p(95)<1500'];
const checkThreshold = isBreakpoint
  ? [{ threshold: 'rate>0.99', abortOnFail: true, delayAbortEval: '3s' }]
  : ['rate>0.99'];

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: failureThreshold,
    http_req_duration: latencyThreshold,
    checks: checkThreshold,
    github_fixture_app_errors: failureThreshold,
  },
};

export function setup() {
  const health = http.get(`${baseUrl}/__fixture/health`);
  if (health.status !== 200 || health.json('outboundGithubNetwork') !== 'disabled') {
    throw new Error('Local fixture health check failed; refusing to run k6');
  }
  const reset = http.post(`${baseUrl}/__fixture/reset`);
  if (reset.status !== 200) throw new Error('Could not reset fixture counters');
  const workload = isBreakpoint ? `ramping to ${maxVus} VUs` : `${vus} VUs for ${duration}`;
  console.log(`Fixture mode=${mode}, profile=${profile}, ${workload}; outbound GitHub calls are disabled.`);
  return { baseUrl };
}

export default function ({ baseUrl: target }) {
  if (!initialized) {
    const session = http.get(`${target}/__fixture/session?mode=${encodeURIComponent(mode)}&user=${__VU}`, {
      timeout: '2s',
    });
    fixtureCookie = session.cookies['github-rate-fixture.sid']?.[0]?.value || '';
    const ready = check(session, {
      'fixture session created': (res) => res.status === 200 && fixtureCookie.length > 0,
    });
    if (!ready) {
      failures.add(true);
      return;
    }
    initialized = true;
  }

  const path = mode === 'random' ? '/api/planets/random' : '/api/me';
  const response = http.get(`${target}${path}`, {
    headers: { Cookie: `github-rate-fixture.sid=${fixtureCookie}` },
    tags: { mode, path },
    timeout: '2s',
  });
  responseDuration.add(response.timings.duration);
  const validJson = response.status === 200 && isExpectedPayload(response, mode);
  failures.add(!validJson);
  check(response, {
    'app returns a usable cached or refreshed response': () => validJson,
  });

  if (thinkTime > 0) sleep(thinkTime);
}

export function teardown({ baseUrl: target }) {
  const response = http.get(`${target}/__fixture/metrics`);
  if (response.status !== 200) {
    console.error('Could not read fixture metrics after the test.');
    return;
  }
  const metrics = response.json();
  console.log(`FIXTURE_METRICS ${JSON.stringify(metrics)}`);
  if (mode === 'refresh429' || mode === 'graphql-error') {
    console.log('Interpretation: every failed /api/me refresh may call GitHub again because the stale timestamp remains unchanged.');
  }
}

function isExpectedPayload(response, testMode) {
  try {
    const payload = response.json();
    if (testMode === 'random') return typeof payload.username === 'string';
    return typeof payload.planetData?.totalCommits === 'number';
  } catch {
    return false;
  }
}

function isLocalUrl(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(url);
}
