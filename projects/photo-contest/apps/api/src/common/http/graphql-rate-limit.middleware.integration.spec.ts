import { afterEach, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi } from '../../../test/support/app';
import { GRAPHQL_RATE_LIMIT_PER_WINDOW } from '../../config/limits';
import { GRAPHQL_RATE_LIMITED } from './graphql-rate-limit.middleware';

const ORIGIN = 'https://web.test';

describe('graphqlRateLimit', () => {
  let api: ITestApi | undefined;

  afterEach(async () => {
    await api?.close();
    api = undefined;
  });

  /** 운영 모드 앱에 브라우저처럼 GraphQL을 보낸다. forwardedFor가 없으면 내부 웹 서버의 요청이다. */
  const send = (forwardedFor?: string) => {
    if (!api) throw new Error('앱을 먼저 만들어야 한다');
    let pending = api.http().post('/graphql').set('Origin', ORIGIN).set('Apollo-Require-Preflight', 'true');
    if (forwardedFor) pending = pending.set('X-Forwarded-For', forwardedFor);
    return pending.send({ query: '{ __typename }' });
  };

  it('운영에서 Caddy가 전달한 주소마다 분당 요청 수를 제한해야 한다', async () => {
    api = await createTestApp({ NODE_ENV: 'production', WEB_ORIGIN: ORIGIN, TRUST_PROXY_HOPS: '1' });
    for (let index = 0; index < GRAPHQL_RATE_LIMIT_PER_WINDOW; index++) {
      const response = await send('203.0.113.10');
      if (response.status !== 200) throw new Error(`${index + 1}번째 요청이 ${response.status}로 거절됐다`);
    }
    const limited = await send('203.0.113.10');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['cache-control']).toBe('private, no-store');
    expect(limited.body).toEqual({
      errors: [{ message: GRAPHQL_RATE_LIMITED, extensions: { code: 'RATE_LIMITED' } }],
    });
    // 다른 사용자와, 클라이언트가 덧붙인 먼 주소는 따로 세지 않는다.
    expect((await send('203.0.113.11')).status).toBe(200);
    expect((await send('198.51.100.1, 203.0.113.10')).status).toBe(429);
    // 전달 헤더가 없는 내부 웹 서버의 공개 캐시 조회는 사용자 제한에 섞지 않는다.
    expect((await send()).status).toBe(200);
  });

  it('개발·테스트 모드에서는 제한하지 않아야 한다', async () => {
    api = await createTestApp({ TRUST_PROXY_HOPS: '1' });
    for (let index = 0; index <= GRAPHQL_RATE_LIMIT_PER_WINDOW; index++) {
      const response = await api
        .http()
        .post('/graphql')
        .set('Origin', 'http://web.test')
        .set('Apollo-Require-Preflight', 'true')
        .set('X-Forwarded-For', '203.0.113.20')
        .send({ query: '{ __typename }' });
      if (response.status !== 200) throw new Error(`${index + 1}번째 요청이 ${response.status}로 거절됐다`);
    }
  });
});
