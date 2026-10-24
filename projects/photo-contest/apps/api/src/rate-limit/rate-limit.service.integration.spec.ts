import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp, type ITestApi } from '../../test/support/app';
import { WRITE_RATE_LIMIT } from '../config/limits';
import { WRITE_RATE_LIMITED } from './rate-limit.service';

const ORIGIN = 'https://web.test';
const CREATE_GROUP = 'mutation($name:String!){createGroup(name:$name){id}}';

describe('쓰기 남용 제한', () => {
  let api: ITestApi;

  beforeAll(async () => {
    // 운영에서만 제한하므로 Caddy 한 단계를 신뢰하는 운영 모드 앱을 만든다. 운영은 개발 로그인이 닫혀 있다.
    api = await createTestApp({ NODE_ENV: 'production', WEB_ORIGIN: ORIGIN, TRUST_PROXY_HOPS: '1' });
  });

  afterAll(async () => {
    await api?.close();
  });

  /** 운영 세션 쿠키(__Host-contest_session)를 가진 사용자를 격리 DB에 바로 만든다. */
  const signIn = async (nickname: string) => {
    const user = await api.db.user.create({
      data: { provider: 'dev', providerId: `rate-limit-${randomUUID()}`, nickname },
    });
    const token = randomBytes(32).toString('base64url');
    await api.db.session.create({
      data: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    return `__Host-contest_session=${token}`;
  };

  const createGroup = (cookie: string, address: string, name: string) =>
    api
      .http()
      .post('/graphql')
      .set('Origin', ORIGIN)
      .set('Apollo-Require-Preflight', 'true')
      .set('Cookie', cookie)
      .set('X-Forwarded-For', address)
      .send({ query: CREATE_GROUP, variables: { name } });

  it('사용자마다 그룹 생성 수를 제한하고 다른 사용자는 따로 세야 한다', async () => {
    const { perUser } = WRITE_RATE_LIMIT.GROUP_CREATE;
    const owner = await signIn('제한-그룹장');
    for (let index = 0; index < perUser; index++) {
      const response = await createGroup(owner, '203.0.113.30', `제한 그룹 ${index}`);
      expect(response.body.errors, `${index + 1}번째 그룹`).toBeUndefined();
    }
    const blocked = await createGroup(owner, '203.0.113.31', '제한 초과 그룹');
    expect(blocked.body.errors[0]).toMatchObject({
      message: WRITE_RATE_LIMITED,
      extensions: { code: 'RATE_LIMITED' },
    });
    const other = await signIn('제한-다른 회원');
    expect((await createGroup(other, '203.0.113.30', '다른 회원 그룹')).body.errors).toBeUndefined();
  });

  it('로그인 전 OAuth 시작은 주소마다 제한하고 내부 웹 서버 요청은 세지 않아야 한다', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'rate-limit-google');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'rate-limit-secret');
    const start = (address?: string) => {
      const request = api.http().get('/auth/google');
      return address ? request.set('X-Forwarded-For', address) : request;
    };
    for (let index = 0; index < WRITE_RATE_LIMIT.OAUTH_START.perAddress; index++)
      expect((await start('2001:db8:44:1::1')).status).toBe(302);
    // 같은 /64 안의 다른 주소도 같은 버킷이다.
    const blocked = await start('2001:db8:44:1::2');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ message: WRITE_RATE_LIMITED });
    expect((await start('2001:db8:44:2::1')).status).toBe(302);
    expect((await start()).status).toBe(302);
  });
});
