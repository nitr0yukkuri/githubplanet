import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const randomPath = normalizePath(__ENV.RANDOM_PATH || '/api/planets/random');
const scenarioName = (__ENV.SCENARIO || 'smoke').toLowerCase();
const expectedStatus = Number(__ENV.EXPECTED_STATUS || 200);
const thinkTimeSeconds = Number(__ENV.THINK_TIME_SECONDS || 0.5);

// 負荷試験はローカルアプリだけに送る。
if (!isLocalUrl(baseUrl)) {
  throw new Error(`ローカルURLだけを指定できます: ${baseUrl}`);
}

const randomPlanetErrors = new Rate('random_planet_errors');
const randomPlanetDuration = new Trend('random_planet_duration', true);

const scenarios = {
  smoke: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '5s', target: 1 },
      { duration: '30s', target: 1 },
      { duration: '5s', target: 0 },
    ],
    gracefulRampDown: '5s',
  },
  showcase: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '10s', target: 1 },
      { duration: '30s', target: 5 },
      { duration: '30s', target: 15 },
      { duration: '10s', target: 0 },
    ],
    gracefulRampDown: '10s',
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '15s', target: 5 },
      { duration: '30s', target: 15 },
      { duration: '30s', target: 30 },
      { duration: '15s', target: 0 },
    ],
    gracefulRampDown: '15s',
  },
  soak: {
    executor: 'constant-vus',
    vus: 5,
    duration: '5m',
  },
};

if (!scenarios[scenarioName]) {
  throw new Error(`SCENARIO must be one of: ${Object.keys(scenarios).join(', ')}`);
}

export const options = {
  scenarios: {
    random_planet: scenarios[scenarioName],
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    checks: ['rate>0.99'],
    random_planet_errors: ['rate<0.01'],
  },
};

export default function randomPlanet() {
  const response = http.get(`${baseUrl}${randomPath}`, {
    tags: {
      endpoint: 'random-planet',
      scenario: scenarioName,
    },
  });

  const hasExpectedStatus = response.status === expectedStatus;
  const isError = response.status >= 500 || !hasExpectedStatus;

  randomPlanetErrors.add(isError);
  randomPlanetDuration.add(response.timings.duration);

  check(response, {
    [`status is ${expectedStatus}`]: (res) => res.status === expectedStatus,
    'response contains a planet username': (res) => {
      if (res.status !== 200) return true;
      try {
        const body = res.json();
        return typeof body?.username === 'string';
      } catch {
        return false;
      }
    },
  });

  if (thinkTimeSeconds > 0) sleep(thinkTimeSeconds);
}

function normalizePath(path) {
  return path.startsWith('/') ? path : `/${path}`;
}

function isLocalUrl(url) {
  return /^https?:\/\/(localhost|host\.docker\.internal|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(url);
}
