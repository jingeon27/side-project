import { check } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL?.replace(/\/$/, '');
if (!baseUrl || !__ENV.WEB_ORIGIN) throw new Error('BASE_URL과 WEB_ORIGIN을 지정해 주세요.');
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
  const response = http.post(
    `${baseUrl}/graphql`,
    JSON.stringify({
      operationName: 'LoadPublicGroups',
      query:
        'query LoadPublicGroups { discoverGroups(visibility: PUBLIC, limit: 20) { id name memberCount } }',
    }),
    {
      headers: { 'Content-Type': 'application/json', Origin: __ENV.WEB_ORIGIN },
      timeout: '10s',
      redirects: 0,
      tags: { name: 'public_group_list' },
    },
  );
  limited.add(response.status === 429);
  check(response, {
    'GraphQL 업무 오류 없이 공개 그룹을 응답한다': (result) => {
      try {
        const payload = result.json();
        return (
          result.status === 200 && !payload.errors?.length && Array.isArray(payload.data?.discoverGroups)
        );
      } catch {
        return false;
      }
    },
  });
}
