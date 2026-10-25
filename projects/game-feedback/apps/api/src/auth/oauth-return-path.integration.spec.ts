import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app';
import { assertDatabaseUrl } from '../database/database-url';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { DemoProfileProvider } from '../game-profiles/providers/demo-profile.provider';
import { PrismaClient } from '../generated/prisma';
import { responseLocation } from '../testing/http-response';
import { OAUTH_RETURN_COOKIE } from './oauth-return-path';

const target = process.env.TEST_DATABASE_URL;
const origin = 'http://localhost:3300';
const require = createRequire(import.meta.url);

describe.skipIf(!target)('OAuth 가입 화면과 원래 목적지 복귀', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const schema = `gf_test_oauth_return_${randomBytes(8).toString('hex')}`;

  beforeAll(async () => {
    const url = new URL(target ?? '');
    url.searchParams.set('schema', schema);
    const databaseUrl = assertDatabaseUrl(url.toString(), 'test');
    const migration = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (migration.status !== 0)
      throw new Error(`OAuth return schema setup failed: ${migration.stdout}\n${migration.stderr}`);
    db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
    app = await createApp({
      databaseUrl,
      prisma: db,
      webOrigin: origin,
      demoMode: false,
      rateLimit: false,
      profileProvider: new DemoProfileProvider(),
      identityProvider: {
        authorizationUrl: ({ state }) => `https://identity.example.test/authorize?state=${state}`,
        exchange: async (code) => code,
      },
    });
  }, 30000);

  afterAll(async () => {
    await app?.close();
    if (!db) return;
    if (!/^gf_test_oauth_return_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned OAuth return schema');
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
  });

  it('소셜 가입 중 게임 프로필을 조회하고 가입과 함께 선택한 태그만 연결해야 한다', async () => {
    await supertest(app.getHttpServer()).get('/api/game-profiles/%23QLLLPR89G').expect(401);
    const agent = supertest.agent(app.getHttpServer());
    const subject = 'onboarding-game-profile';
    const start = await agent.get('/api/auth/google').expect(302);
    await agent
      .get('/api/auth/google/callback')
      .query({
        state: new URL(responseLocation(start)).searchParams.get('state'),
        code: subject,
      })
      .expect(302);
    const preview = await agent.get('/api/game-profiles/%23qlllpr89g').expect(200);
    expect(preview.body).toMatchObject({ playerTag: '#QLLLPR89G', verification: 'UNVERIFIED' });
    await agent
      .post('/api/me/game-accounts')
      .set('Origin', origin)
      .send({ playerTag: '#QLLLPR89G' })
      .expect(401);
    const input = { nickname: '게임 연결 회원', acceptedTerms: true, ageConfirmed: true };
    await agent
      .post('/api/auth/onboard')
      .set('Origin', origin)
      .send({ ...input, playerTag: '#bad tag' })
      .expect(400);
    expect((await agent.get('/api/session')).body).toMatchObject({ user: null, needsOnboarding: true });
    expect(await db.socialIdentity.count({ where: { subject } })).toBe(0);
    const complete = await agent
      .post('/api/auth/onboard')
      .set('Origin', origin)
      .send({ ...input, playerTag: '#qlllpr89g' })
      .expect(200);
    expect(complete.body).toMatchObject({
      needsOnboarding: false,
      user: { supercellTag: '#QLLLPR89G', isVerified: false },
    });
    expect((await agent.get('/api/me/game-accounts').expect(200)).body).toMatchObject([
      { playerTag: '#QLLLPR89G', verification: 'UNVERIFIED' },
    ]);
    expect(await db.gameAccount.count({ where: { userId: complete.body.user.id } })).toBe(1);
    await agent.post('/api/auth/onboard').set('Origin', origin).send(input).expect(401);
  });

  it.each(['ko', 'en', 'ja'])(
    '%s 신규 사용자는 별도 가입 화면으로, 기존 사용자는 원래 화면으로 가야 한다',
    async (locale) => {
      const agent = supertest.agent(app.getHttpServer());
      const original = `/${locale}/boards/coaching?coachingRole=STUDENT`;
      const returnTo = `/${locale}/login?returnTo=${encodeURIComponent(original)}`;
      const subject = `oauth-return-${locale}`;
      const start = await agent.get('/api/auth/google').query({ returnTo }).expect(302);
      const callback = await agent
        .get('/api/auth/google/callback')
        .query({
          state: new URL(responseLocation(start)).searchParams.get('state'),
          code: subject,
        })
        .expect(302);
      const onboarding = new URL(responseLocation(callback));
      expect(onboarding.origin).toBe(origin);
      expect(onboarding.pathname).toBe(`/${locale}/onboarding`);
      expect(onboarding.searchParams.get('returnTo')).toBe(original);
      expect(onboarding.searchParams.has('onboard')).toBe(false);
      expect((await agent.get('/api/session').expect(200)).body).toMatchObject({
        user: null,
        needsOnboarding: true,
      });
      await agent
        .post('/api/auth/onboard')
        .set('Origin', origin)
        .send({
          nickname: `${locale}가입 사용자`,
          acceptedTerms: true,
          ageConfirmed: true,
        })
        .expect(200);
      const again = await agent.get('/api/auth/google').query({ returnTo }).expect(302);
      const existing = await agent
        .get('/api/auth/google/callback')
        .query({
          state: new URL(responseLocation(again)).searchParams.get('state'),
          code: subject,
        })
        .expect(302);
      expect(existing.headers.location).toBe(`${origin}${original}`);
      expect((await agent.get('/api/session').expect(200)).body.needsOnboarding).toBe(false);
    },
  );

  it('Google subject 설정이 남아 있어도 가입·로그인으로 관리자 권한을 부여하지 않아야 한다', async () => {
    const subject = 'operator-bootstrap-removed';
    vi.stubEnv('GF_ADMIN_GOOGLE_SUB', subject);
    try {
      const agent = supertest.agent(app.getHttpServer());
      const signIn = async () => {
        const start = await agent.get('/api/auth/google').expect(302);
        await agent
          .get('/api/auth/google/callback')
          .query({
            state: new URL(responseLocation(start)).searchParams.get('state'),
            code: subject,
          })
          .expect(302);
      };
      await signIn();
      await agent
        .post('/api/auth/onboard')
        .set('Origin', origin)
        .send({
          nickname: '운영자 지정 전',
          acceptedTerms: true,
          ageConfirmed: true,
        })
        .expect(200);
      const user = await db.user.findUniqueOrThrow({ where: { googleSubject: subject } });
      expect(user.role).toBe('USER');
      await signIn();
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('USER');
      await agent.get(`/api/admin/users/${user.id}`).expect(403);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('로그인을 취소하면 선택한 언어의 로그인 화면과 원래 복귀 경로를 보존해야 한다', async () => {
    const agent = supertest.agent(app.getHttpServer());
    const returnTo = '/en/login?returnTo=%2Fen%2Fsettings';
    const start = await agent.get('/api/auth/google').query({ returnTo }).expect(302);
    const callback = await agent
      .get('/api/auth/google/callback')
      .query({
        state: new URL(responseLocation(start)).searchParams.get('state'),
      })
      .expect(302);
    const cancelled = new URL(responseLocation(callback));
    expect(cancelled.origin).toBe(origin);
    expect(cancelled.pathname).toBe('/en/login');
    expect(cancelled.searchParams.get('returnTo')).toBe('/en/settings');
    expect(cancelled.searchParams.get('login')).toBe('cancelled');
    expect((await agent.get('/api/session').expect(200)).body.needsOnboarding).toBe(false);
  });

  it('외부·다른 언어·로그인 또는 가입 루프 목적지는 OAuth 시도를 만들기 전에 거부해야 한다', async () => {
    const attempts = await db.oAuthAttempt.count();
    for (const returnTo of [
      'https://outside.test',
      '/ko/../en/settings',
      '/ja/login?returnTo=https%3A%2F%2Foutside.test',
      '/ja/login?returnTo=%2Fen%2Fsettings',
      '/ja/login?returnTo=%2Fja%2Flogin',
      '/ja/login?returnTo=%2Fja%2Fonboarding',
    ])
      await supertest(app.getHttpServer()).get('/api/auth/google').query({ returnTo }).expect(400);
    expect(await db.oAuthAttempt.count()).toBe(attempts);
  });

  it('변조한 복귀 쿠키는 외부로 보내지 않고 한국어 가입 화면의 홈 목적지로 대체해야 한다', async () => {
    const start = await supertest(app.getHttpServer()).get('/api/auth/google').expect(302);
    const state = new URL(responseLocation(start)).searchParams.get('state');
    const unsafe = '/ja/login?returnTo=https%3A%2F%2Foutside.test';
    const callback = await supertest(app.getHttpServer())
      .get('/api/auth/google/callback')
      .set('Cookie', [
        `gamefeedback_oauth=${state}`,
        `${OAUTH_RETURN_COOKIE}=${Buffer.from(unsafe).toString('base64url')}`,
      ])
      .query({ state, code: 'tampered-return-cookie' })
      .expect(302);
    const destination = new URL(responseLocation(callback));
    expect(destination.origin).toBe(origin);
    expect(destination.pathname).toBe('/ko/onboarding');
    expect(destination.searchParams.get('returnTo')).toBe('/ko');
  });
});
