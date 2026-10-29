import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi } from '../../../test/support/app';
import {
  cookieAttributes,
  cookiePair,
  cookieValue,
  findSetCookie,
  isClearingCookie,
  setCookies,
} from '../../../test/support/cookies';

const ORIGIN = 'https://web.test';
const REGISTER =
  'mutation($loginId:String!,$password:String!,$nickname:String!){registerWithPassword(loginId:$loginId,password:$password,nickname:$nickname){id}}';

describe('운영 인증 쿠키', () => {
  let api: ITestApi;

  beforeAll(async () => {
    api = await createTestApp({ NODE_ENV: 'production', WEB_ORIGIN: ORIGIN });
    await api.db.authAttempt.deleteMany();
  });

  afterAll(async () => {
    await api?.close();
  });

  const me = async (cookie: string) => {
    const response = await api
      .http()
      .post('/graphql')
      .set('Origin', ORIGIN)
      .set('Apollo-Require-Preflight', 'true')
      .set('Cookie', cookie)
      .send({ query: '{ me { id } }' });
    return (response.body as { data: { me: { id: string } | null } }).data.me?.id ?? null;
  };

  it('세션은 __Host-contest_session으로만 발급·조회·삭제해야 한다', async () => {
    const registered = await api
      .http()
      .post('/graphql')
      .set('Origin', ORIGIN)
      .set('Apollo-Require-Preflight', 'true')
      .send({
        query: REGISTER,
        variables: {
          loginId: 'host_cookie',
          password: '운영 쿠키 확인 비밀번호 2026',
          nickname: '운영 쿠키',
        },
      });
    expect(registered.body.errors).toBeUndefined();
    const userId: string = registered.body.data.registerWithPassword.id;
    expect(findSetCookie(registered, 'contest_session')).toBeUndefined();
    // 가입은 이전 세션 쿠키를 먼저 지우고 새 쿠키를 내려주므로 마지막 값이 새 세션이다.
    const issued =
      setCookies(registered)
        .filter((cookie) => cookie.startsWith('__Host-contest_session='))
        .at(-1) ?? '';
    expect(cookieValue(issued)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const attributes = cookieAttributes(issued);
    expect(attributes).toEqual(expect.arrayContaining(['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax']));
    expect(attributes.some((attribute) => attribute.startsWith('Domain='))).toBe(false);

    expect(await me(cookiePair(issued))).toBe(userId);
    // 접두사 없는 이름은 형제 서브도메인도 심을 수 있으므로 운영에서는 읽지 않는다.
    expect(await me(`contest_session=${cookieValue(issued)}`)).toBeNull();

    const logout = await api
      .http()
      .post('/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', cookiePair(issued));
    expect(logout.status).toBe(200);
    expect(isClearingCookie(findSetCookie(logout, '__Host-contest_session') ?? '')).toBe(true);
    expect(await me(cookiePair(issued))).toBeNull();
  });
});
