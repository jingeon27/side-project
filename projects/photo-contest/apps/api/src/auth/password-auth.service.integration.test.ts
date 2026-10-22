import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi } from '../../test/support/app';
import { AUTH_LOGIN_ID_LIMIT, AUTH_REGISTER_IP_LIMIT } from '../config/limits';

const REGISTER =
  'mutation($loginId:String!,$password:String!,$nickname:String!){registerWithPassword(loginId:$loginId,password:$password,nickname:$nickname){id}}';
const LOGIN =
  'mutation($loginId:String!,$password:String!){loginWithPassword(loginId:$loginId,password:$password){id}}';
const PASSWORD = '로그인 제한 회귀 비밀번호 2026!';

describe('PasswordAuthService 제한 회귀', () => {
  let api: ITestApi;

  beforeAll(async () => {
    // Caddy 한 단계를 신뢰해 전달된 주소별로 제한을 나누는 운영 설정
    api = await createTestApp({ TRUST_PROXY_HOPS: '1' });
  });

  beforeEach(async () => {
    await api.db.authAttempt.deleteMany();
  });

  afterAll(async () => {
    await api?.close();
  });

  const call = (query: string, variables: Record<string, unknown>, address: string) =>
    api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Apollo-Require-Preflight', 'true')
      .set('X-Forwarded-For', address)
      .send({ query, variables });

  it('성공한 로그인은 아이디 버킷을 쓰지 않고 실패만 세야 한다', async () => {
    // 검증 전에 아이디 버킷을 올려 남이 성공·실패와 관계없이 표적 계정을 잠글 수 있었다.
    const address = '198.51.100.20';
    expect(
      (await call(REGISTER, { loginId: 'limit_success', password: PASSWORD, nickname: '제한 회귀' }, address))
        .body.errors,
    ).toBeUndefined();
    for (let index = 0; index <= AUTH_LOGIN_ID_LIMIT; index++) {
      const response = await call(LOGIN, { loginId: 'limit_success', password: PASSWORD }, address);
      expect(response.body.errors, `${index + 1}번째 로그인`).toBeUndefined();
    }
    for (let index = 0; index < AUTH_LOGIN_ID_LIMIT; index++) {
      const response = await call(LOGIN, { loginId: 'limit_success', password: '틀린 비밀번호' }, address);
      expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    }
    const blocked = await call(LOGIN, { loginId: 'limit_success', password: PASSWORD }, address);
    expect(blocked.body.errors[0].extensions.code).toBe('RATE_LIMITED');
  });

  it('IPv6는 같은 /64 안의 주소를 하나의 버킷으로 세야 한다', async () => {
    // 가입자가 받은 /64 안에서 주소만 바꿔 IP 제한을 피할 수 있었다.
    const invalid = { loginId: 'bad', password: 'short', nickname: '회원' };
    for (let index = 0; index < AUTH_REGISTER_IP_LIMIT; index++) {
      const response = await call(REGISTER, invalid, `2001:db8:77:1::${(index + 1).toString(16)}`);
      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    }
    const sameBlock = await call(REGISTER, invalid, '2001:db8:77:1:ffff::1');
    expect(sameBlock.body.errors[0].extensions.code).toBe('RATE_LIMITED');
    const otherBlock = await call(REGISTER, invalid, '2001:db8:77:2::1');
    expect(otherBlock.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });
});
