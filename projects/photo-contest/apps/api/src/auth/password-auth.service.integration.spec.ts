import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi } from '../../test/support/app';
import { AUTH_LOGIN_ID_LIMIT, AUTH_REGISTER_IP_LIMIT } from '../config/limits';

const REGISTER =
  'mutation($loginId:String!,$password:String!,$nickname:String!){registerWithPassword(loginId:$loginId,password:$password,nickname:$nickname){id nickname avatar}}';
const LOGIN =
  'mutation($loginId:String!,$password:String!){loginWithPassword(loginId:$loginId,password:$password){id nickname avatar}}';
const PASSWORD = '오래 기억할 수 있는 비밀번호 2026!';

describe('아이디·비밀번호 계정', () => {
  let api: ITestApi;
  beforeAll(async () => {
    api = await createTestApp();
  });
  beforeEach(async () => {
    await api.db.authAttempt.deleteMany();
  });
  afterAll(async () => {
    await api?.close();
  });
  const call = (query: string, variables: Record<string, unknown>, cookie?: string) => {
    const req = api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Apollo-Require-Preflight', 'true');
    if (cookie) req.set('Cookie', cookie);
    return req.send({ query, variables });
  };
  const register = (loginId: string) =>
    call(REGISTER, { loginId, password: PASSWORD, nickname: '가입 회원' });
  const cookieOf = (response: { headers: Record<string, unknown> }) => {
    const cookies = response.headers['set-cookie'] as string[];
    return [...cookies]
      .reverse()
      .find((cookie) => cookie.startsWith('contest_session=') && !cookie.startsWith('contest_session=;'))
      ?.split(';')[0];
  };

  it('가입하면 해시만 저장하고 HttpOnly 세션으로 로그인돼야 한다', async () => {
    const res = await register('  My_First_ID  ');
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.registerWithPassword.nickname).toBe('가입 회원');
    const credential = await api.db.passwordCredential.findUniqueOrThrow({
      where: { loginId: 'my_first_id' },
    });
    expect(credential.passwordHash).toMatch(/^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    expect(credential.passwordHash).not.toContain(PASSWORD);
    expect(JSON.stringify(res.body)).not.toContain('password');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.at(-1)).toContain('HttpOnly');
    expect(cookies.at(-1)).toContain('SameSite=Lax');
    const viewer = await api.gqlOk<{ me: { id: string } }>(cookieOf(res), '{ me { id } }');
    expect(viewer.me.id).toBe(credential.userId);
  });

  it('대소문자 중복과 동시 가입은 계정 하나만 남겨야 한다', async () => {
    const responses = await Promise.all([register('race_account'), register('RACE_ACCOUNT')]);
    expect(responses.filter((r) => r.body.data?.registerWithPassword).length).toBe(1);
    expect(responses.find((r) => r.body.errors)?.body.errors[0].extensions.code).toBe('CONFLICT');
    expect(await api.db.passwordCredential.count({ where: { loginId: 'race_account' } })).toBe(1);
  });

  it('로그인은 기존 세션을 폐기하고 새 쿠키를 발급해야 한다', async () => {
    const registration = await register('login_account');
    const oldCookie = cookieOf(registration);
    const login = await call(LOGIN, { loginId: 'LOGIN_ACCOUNT', password: PASSWORD }, oldCookie);
    expect(login.body.data.loginWithPassword.id).toBe(registration.body.data.registerWithPassword.id);
    expect(cookieOf(login)).not.toBe(oldCookie);
    expect((await api.gqlOk<{ me: null }>(oldCookie, '{ me { id } }')).me).toBeNull();
    expect((await api.gqlOk<{ me: { id: string } }>(cookieOf(login), '{ me { id } }')).me.id).toBe(
      registration.body.data.registerWithPassword.id,
    );
    await api
      .http()
      .post('/auth/logout')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Cookie', cookieOf(login) ?? '');
    expect((await api.gqlOk<{ me: null }>(cookieOf(login), '{ me { id } }')).me).toBeNull();
  });

  it('없는 아이디와 틀린 비밀번호는 같은 오류로 거절해야 한다', async () => {
    await register('wrong_password');
    for (const loginId of ['wrong_password', 'missing_password']) {
      const res = await call(LOGIN, { loginId, password: '틀린 비밀번호' });
      expect(res.body.errors[0]).toMatchObject({
        message: '아이디 또는 비밀번호를 확인해 주세요.',
        extensions: { code: 'UNAUTHENTICATED' },
      });
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('아이디·닉네임·비밀번호 제한은 서버에서도 검사해야 한다', async () => {
    for (const values of [
      { loginId: 'ab' },
      { loginId: '잘못된아이디' },
      { nickname: ' ' },
      { password: 'short' },
      { password: 'x'.repeat(129) },
    ]) {
      const res = await call(REGISTER, {
        loginId: 'invalid_account',
        password: PASSWORD,
        nickname: '검증',
        ...values,
      });
      expect(res.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    }
    expect(await api.db.passwordCredential.count({ where: { loginId: 'invalid_account' } })).toBe(0);
  });

  it('동일 계정의 반복 로그인과 반복 가입을 DB에서 제한해야 한다', async () => {
    for (let i = 0; i < AUTH_LOGIN_ID_LIMIT; i++)
      await call(LOGIN, { loginId: 'throttle_account', password: PASSWORD });
    const blocked = await call(LOGIN, { loginId: 'throttle_account', password: PASSWORD });
    expect(blocked.body.errors[0].extensions.code).toBe('RATE_LIMITED');
    await api.db.authAttempt.deleteMany();
    for (let i = 0; i < AUTH_REGISTER_IP_LIMIT; i++)
      await call(REGISTER, { loginId: 'bad', password: 'short', nickname: '테스트' });
    expect((await register('throttle_register')).body.errors[0].extensions.code).toBe('RATE_LIMITED');
    expect(await api.db.authAttempt.findMany()).toEqual(
      expect.arrayContaining([expect.objectContaining({ keyHash: expect.stringMatching(/^[a-f0-9]{64}$/) })]),
    );
  });

  it('외부 Origin은 가입 처리 전에 거절해야 한다', async () => {
    const res = await api
      .http()
      .post('/graphql')
      .set('Origin', 'https://evil.example')
      .send({
        query: REGISTER,
        variables: { loginId: 'origin_attack', password: PASSWORD, nickname: '외부' },
      });
    expect(res.status).toBe(403);
    expect(await api.db.passwordCredential.findUnique({ where: { loginId: 'origin_attack' } })).toBeNull();
  });
});
