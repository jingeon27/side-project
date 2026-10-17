import { afterEach, describe, expect, it } from 'vitest';

import { AUTH_REGISTER_IP_LIMIT } from '../../src/config/limits';
import { createTestApp, TEST_WEB_ORIGIN, type ITestApi } from '../support/app';

describe('운영 프록시의 가입 제한', () => {
  let api: ITestApi | undefined;
  afterEach(async () => {
    await api?.close();
    api = undefined;
  });

  it('프록시를 신뢰하지 않으면 전달 헤더를 바꿔도 같은 요청 주소의 제한을 유지해야 한다', async () => {
    api = await createTestApp({ TRUST_PROXY_HOPS: '0' });
    await api.db.authAttempt.deleteMany();
    for (let index = 0; index <= AUTH_REGISTER_IP_LIMIT; index++) {
      const response = await api
        .http()
        .post('/graphql')
        .set('Origin', TEST_WEB_ORIGIN)
        .set('Apollo-Require-Preflight', 'true')
        .set('X-Forwarded-For', `203.0.113.${index + 1}`)
        .send({
          query: 'mutation{registerWithPassword(loginId:"bad",password:"short",nickname:"회원"){id}}',
        });
      expect(response.body.errors[0].extensions.code).toBe(
        index === AUTH_REGISTER_IP_LIMIT ? 'RATE_LIMITED' : 'BAD_USER_INPUT',
      );
    }
  });

  it('Caddy 한 단계를 신뢰하면 멤버마다 제한을 분리하고 더 먼 전달 주소는 무시해야 한다', async () => {
    api = await createTestApp({ TRUST_PROXY_HOPS: '1' });
    await api.db.authAttempt.deleteMany();
    for (let index = 0; index <= AUTH_REGISTER_IP_LIMIT; index++) {
      const response = await api
        .http()
        .post('/graphql')
        .set('Origin', TEST_WEB_ORIGIN)
        .set('Apollo-Require-Preflight', 'true')
        .set('X-Forwarded-For', `198.51.100.1, 203.0.113.${index + 1}`)
        .send({
          query: 'mutation{registerWithPassword(loginId:"bad",password:"short",nickname:"회원"){id}}',
        });
      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    }
  });
});
