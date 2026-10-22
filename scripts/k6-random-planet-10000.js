import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const endpoint = `${baseUrl}/api/planets/random`;
const virtualUsers = Number(__ENV.VUS || 30);
const iterations = Number(__ENV.ITERATIONS || 10000);
const thinkTimeSeconds = Number(__ENV.THINK_TIME_SECONDS || 0.5);
const errors = new Rate('random_planet_10000_errors');
const duration = new Trend('random_planet_10000_duration', true);

if (!isLocalUrl(baseUrl)) {
  throw new Error(`ローカルURLだけを指定できます: ${baseUrl}`);
}

export const options = {
  scenarios: {
    ten_thousand_random_planet_requests: {
      executor: 'shared-iterations',
      vus: virtualUsers,
      iterations,
      maxDuration: __ENV.MAX_DURATION || '10m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    checks: ['rate>0.99'],
    random_planet_10000_errors: ['rate<0.01'],
  },
};

export default function tenThousandRequests() {
  const response = http.get(endpoint, {
    tags: { endpoint: 'random-planet', scenario: '10000-requests' },
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

  if (thinkTimeSeconds > 0) sleep(thinkTimeSeconds);
}

function isLocalUrl(url) {
  return /^https?:\/\/(localhost|host\.docker\.internal|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(url);
}
