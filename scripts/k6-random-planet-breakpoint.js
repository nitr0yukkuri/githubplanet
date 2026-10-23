import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const endpoint = `${baseUrl}/api/planets/random`;
const errors = new Rate('random_planet_breakpoint_errors');
const duration = new Trend('random_planet_breakpoint_duration', true);

if (!isLocalUrl(baseUrl)) {
  throw new Error(`ローカルURLだけを指定できます: ${baseUrl}`);
}

export const options = {
  scenarios: {
    random_planet_breakpoint: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 30 },
        { duration: '15s', target: 50 },
        { duration: '15s', target: 75 },
        { duration: '15s', target: 100 },
        { duration: '15s', target: 150 },
        { duration: '15s', target: 200 },
        { duration: '15s', target: 300 },
        { duration: '15s', target: 400 },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    // 5%超の失敗または3秒超のp95を10秒継続したら、限界到達として停止する。
    http_req_failed: [
      { threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '10s' },
    ],
    http_req_duration: [
      { threshold: 'p(95)<3000', abortOnFail: true, delayAbortEval: '10s' },
    ],
    checks: ['rate>0.95'],
    random_planet_breakpoint_errors: [
      { threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '10s' },
    ],
  },
};

export default function breakpointTest() {
  const response = http.get(endpoint, {
    tags: { endpoint: 'random-planet', scenario: 'breakpoint' },
  });
  const isExpected = response.status === 200;

  errors.add(!isExpected);
  duration.add(response.timings.duration);

  check(response, {
    'status is 200': (res) => res.status === 200,
    'response contains a planet username': (res) => {
      if (res.status !== 200) return false;
      try {
        const body = res.json();
        return typeof body?.username === 'string';
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}

function isLocalUrl(url) {
  return /^https?:\/\/(localhost|host\.docker\.internal|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(url);
}
