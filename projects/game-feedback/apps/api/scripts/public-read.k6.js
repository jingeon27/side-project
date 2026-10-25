import { check } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL?.replace(/\/$/, '');
if (!baseUrl) throw new Error('BASE_URL을 지정해 주세요.');
const limited = new Rate('rate_limited');

export const options = {
  scenarios: {
    public_reads: {
      exec: 'publicRead',
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 1),
      timeUnit: '1s',
      duration: __ENV.DURATION || '30s',
      preAllocatedVUs: 5,
      maxVUs: 50,
    },
  },
  summaryTrendStats: ['avg', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    checks: ['rate>0.99'],
    rate_limited: ['rate==0'],
    dropped_iterations: ['count==0'],
  },
};

export function publicRead() {
  const response = http.get(`${baseUrl}/api/posts?limit=20`, {
    timeout: '10s',
    redirects: 0,
    tags: { name: 'public_post_list' },
  });
  limited.add(response.status === 429);
  check(response, {
    '게시물 목록을 정상 응답한다': (result) => {
      try {
        return result.status === 200 && Array.isArray(result.json('items'));
      } catch {
        return false;
      }
    },
  });
}
