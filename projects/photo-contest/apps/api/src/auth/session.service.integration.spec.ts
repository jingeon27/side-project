import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi, type ITestUser } from '../../test/support/app';
import { cookieAttributes, cookieValue, findSetCookie, isClearingCookie } from '../../test/support/cookies';
import { COOKIE_HEADER_MAX_LENGTH } from '../config/limits';
import { SessionService } from './session.service';

const SESSION_COOKIE = 'contest_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

describe('개발 로그인과 세션', () => {
  let api: ITestApi;

  beforeAll(async () => {
    api = await createTestApp();
  });

  afterAll(async () => {
    await api?.close();
  });

  function devLogin(nickname: unknown, origin = TEST_WEB_ORIGIN) {
    return api.http().post('/auth/dev').set('Origin', origin).send({ nickname });
  }

  /** 주어진 Cookie 헤더 원문으로 me를 조회한다. */
  async function viewerWith(cookieHeader: string | undefined) {
    const { me } = await api.gqlOk<{ me: { id: string } | null }>(cookieHeader, '{ me { id } }');
    return me?.id ?? null;
  }

  it('개발 로그인은 HttpOnly·SameSite=Lax·Path=/ 세션 쿠키를 30일짜리로 내려줘야 한다', async () => {
    const response = await devLogin('세션-쿠키');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    const cookie = findSetCookie(response, SESSION_COOKIE);
    expect(cookie).toBeDefined();
    const attributes = cookieAttributes(cookie!);
    expect(attributes).toEqual(expect.arrayContaining(['HttpOnly', 'SameSite=Lax', 'Path=/']));
    expect(attributes).toContain(`Max-Age=${SESSION_MAX_AGE_SECONDS}`);
    // 개발 모드(http)에서는 Secure를 붙이지 않는다. 운영 모드는 앱 로그인 교환 테스트가 본다.
    expect(attributes).not.toContain('Secure');
    expect(cookieValue(cookie!)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('세션 원문은 DB에 남기지 않고 SHA-256 해시만 저장해야 한다', async () => {
    const response = await devLogin('세션-해시');
    const token = cookieValue(findSetCookie(response, SESSION_COOKIE)!);
    expect(await api.db.session.findUnique({ where: { tokenHash: token } })).toBeNull();
    const stored = await api.db.session.findUnique({ where: { tokenHash: sha256Hex(token) } });
    expect(stored?.expiresAt.getTime()).toBeGreaterThan(Date.now() + (SESSION_MAX_AGE_SECONDS - 60) * 1000);
  });

  it('닉네임은 앞뒤 공백을 지우고 1~24자만 받아야 한다', async () => {
    for (const nickname of ['', '   ', '가'.repeat(25), 42, null]) {
      const response = await devLogin(nickname);
      expect(response.status, String(nickname)).toBe(400);
      expect(response.body).toEqual({ message: '닉네임은(는) 1~24자여야 합니다.' });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    const cookie = await api.login('  세션 공백  ');
    expect(await api.gqlOk(cookie, '{ me { nickname } }')).toEqual({ me: { nickname: '세션 공백' } });
  });

  it('같은 닉네임으로 다시 로그인하면 같은 사용자의 새 세션이어야 한다', async () => {
    const first = await api.signIn('세션-재로그인');
    const second = await api.signIn('세션-재로그인');
    expect(second.id).toBe(first.id);
    expect(second.cookie).not.toBe(first.cookie);
    expect(await api.db.session.count({ where: { userId: first.id } })).toBe(2);
  });

  it('다른 출처의 요청과 운영 모드 개발 로그인을 거부해야 한다', async () => {
    const csrf = await devLogin('세션-외부', 'https://evil.example');
    expect(csrf.status).toBe(403);

    vi.stubEnv('NODE_ENV', 'production');
    const production = await devLogin('세션-운영');
    expect(production.status).toBe(403);
    expect(production.body).toEqual({ message: '개발 로그인이 비활성화되어 있습니다.' });
    expect(production.headers['set-cookie']).toBeUndefined();
    expect(await api.db.user.count({ where: { nickname: { in: ['세션-외부', '세션-운영'] } } })).toBe(0);
  });

  it('ENABLE_DEV_LOGIN이 true가 아니면 개발 모드에서도 개발 로그인을 거부해야 한다', async () => {
    vi.stubEnv('ENABLE_DEV_LOGIN', 'false');
    const response = await devLogin('세션-꺼짐');
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: '개발 로그인이 비활성화되어 있습니다.' });
  });

  it('/auth/config는 지금 켜진 로그인 방식을 알려줘야 한다', async () => {
    expect((await api.http().get('/auth/config').expect(200)).body).toEqual({
      developmentLogin: true,
      google: false,
      kakao: false,
    });
    vi.stubEnv('GOOGLE_CLIENT_ID', 'config-google');
    vi.stubEnv('KAKAO_CLIENT_ID', 'config-kakao');
    vi.stubEnv('NODE_ENV', 'production');
    expect((await api.http().get('/auth/config').expect(200)).body).toEqual({
      developmentLogin: false,
      google: true,
      kakao: true,
    });
  });

  it('로그아웃 이후 기존 세션은 사용할 수 없어야 한다', async () => {
    const user = await api.signIn('세션-로그아웃');
    expect(await api.gqlOk(user.cookie, '{ me { nickname } }')).toEqual({
      me: { nickname: '세션-로그아웃' },
    });

    const logout = await api
      .http()
      .post('/auth/logout')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Cookie', user.cookie);
    expect(logout.status).toBe(200);
    expect(logout.body).toEqual({ ok: true });
    const cleared = findSetCookie(logout, SESSION_COOKIE);
    expect(cleared && isClearingCookie(cleared)).toBe(true);

    expect(await viewerWith(user.cookie)).toBeNull();
    expect(await api.db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('세션 없이 로그아웃해도 200이어야 한다', async () => {
    const response = await api.http().post('/auth/logout').set('Origin', TEST_WEB_ORIGIN);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('만료된 세션은 비로그인으로 봐야 한다', async () => {
    const user = await api.signIn('세션-만료');
    await api.db.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await viewerWith(user.cookie)).toBeNull();
    expect(await api.gqlFail(user.cookie, '{ myGroups { id } }')).toEqual({
      code: 'UNAUTHENTICATED',
      message: '먼저 로그인해 주세요.',
    });
  });

  it('Authorization Bearer 헤더의 세션 토큰은 인증에 쓰지 않아야 한다', async () => {
    const user = await api.signIn('세션-베어러');
    const token = cookieValue(user.cookie);
    const response = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Authorization', `Bearer ${token}`)
      .send({ query: '{ me { id } }' });
    expect(response.body).toEqual({ data: { me: null } });
  });

  it('한 요청 안에서는 필드가 여럿이어도 세션을 한 번만 조회해야 한다', async () => {
    const user = await api.signIn('세션-한번');
    const findViewer = vi.spyOn(
      api.app.get(SessionService) as unknown as { findViewer: () => Promise<unknown> },
      'findViewer',
    );
    try {
      await api.gqlOk(
        user.cookie,
        '{ me { id } myGroups { id contests { id } } invitePreview: me { nickname } }',
      );
      expect(findViewer).toHaveBeenCalledTimes(1);
      await api.gqlOk(user.cookie, '{ me { id } }');
      expect(findViewer).toHaveBeenCalledTimes(2);
    } finally {
      findViewer.mockRestore();
    }
  });

  describe('Cookie 헤더 파싱', () => {
    let user: ITestUser;
    let other: ITestUser;
    let token: string;
    let otherToken: string;

    beforeAll(async () => {
      user = await api.signIn('쿠키-주인');
      other = await api.signIn('쿠키-다른사람');
      token = cookieValue(user.cookie);
      otherToken = cookieValue(other.cookie);
    });

    it('다른 쿠키·공백·빈 구간과 섞여 있어도 세션을 찾아야 한다', async () => {
      expect(await viewerWith(`theme=dark; ${SESSION_COOKIE}=${token}; locale=ko`)).toBe(user.id);
      expect(await viewerWith(`;;  ${SESSION_COOKIE}=${token}  ;`)).toBe(user.id);
      expect(await viewerWith(`${SESSION_COOKIE}_old=${otherToken}; ${SESSION_COOKIE}=${token}`)).toBe(
        user.id,
      );
    });

    it('같은 이름이 여러 번 오면 첫 값만 써야 한다', async () => {
      expect(await viewerWith(`${SESSION_COOKIE}=${token}; ${SESSION_COOKIE}=${otherToken}`)).toBe(user.id);
      expect(await viewerWith(`${SESSION_COOKIE}=${otherToken}; ${SESSION_COOKIE}=${token}`)).toBe(other.id);
      // 첫 값이 깨졌으면 뒤의 값으로 넘어가지 않는다.
      expect(await viewerWith(`${SESSION_COOKIE}=broken; ${SESSION_COOKIE}=${token}`)).toBeNull();
    });

    it('따옴표로 감싸거나 퍼센트 인코딩한 값을 풀어서 읽어야 한다', async () => {
      expect(await viewerWith(`${SESSION_COOKIE}="${token}"`)).toBe(user.id);
      const encoded = [...token].map((char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`).join('');
      expect(await viewerWith(`${SESSION_COOKIE}=${encoded}`)).toBe(user.id);
    });

    it('상한(8KB)까지의 Cookie 헤더는 읽고 넘으면 비로그인으로 봐야 한다', async () => {
      const header = (length: number) => {
        const session = `${SESSION_COOKIE}=${token}; padding=`;
        return session + 'x'.repeat(length - session.length);
      };
      // 다른 쿠키가 많아 4KB를 넘은 로그인 사용자를 비로그인으로 판정하던 회귀를 막는다.
      expect(await viewerWith(header(6000))).toBe(user.id);
      expect(await viewerWith(header(COOKIE_HEADER_MAX_LENGTH))).toBe(user.id);
      expect(await viewerWith(header(COOKIE_HEADER_MAX_LENGTH + 1))).toBeNull();
    });

    it('형식이 깨진 세션 값은 비로그인으로 봐야 한다', async () => {
      const broken = [
        `${SESSION_COOKIE}`,
        `${SESSION_COOKIE}=`,
        `${SESSION_COOKIE}=${token.slice(1)}`,
        `${SESSION_COOKIE}=${token}A`,
        `${SESSION_COOKIE}="${token}`,
        `${SESSION_COOKIE}=${token.slice(0, -1)}!`,
        `${SESSION_COOKIE}=${token.slice(0, -3)}%E0%A4%A`,
        `${SESSION_COOKIE}=${token.slice(0, -3)}%2F%2F%2F`,
      ];
      for (const header of broken) expect(await viewerWith(header), header).toBeNull();
    });
  });
});
