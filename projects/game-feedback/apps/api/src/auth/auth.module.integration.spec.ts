import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CacheInvalidationModule } from '../cache-invalidation/cache-invalidation.module';
import { ApiExceptionFilter } from '../common/http/api-exception.filter';
import { configureHttp, createHttpAdapter } from '../common/http/configure-http';
import { resolveAppConfig, type AppOptions } from '../config/app.config';
import { DatabaseModule } from '../database/database.module';
import { DemoProfileProvider } from '../game-profiles/providers/demo-profile.provider';
import { PROFILE_PROVIDER } from '../game-profiles/providers/profile-provider.factory';
import { ProfileException } from '../game-profiles/providers/profile.exception';
import { PrismaClient, type Prisma } from '../generated/prisma';
import { responseCookies, responseLocation } from '../testing/http-response';
import { AuthModule } from './auth.module';
import { IDENTITY_PROVIDERS, IdentityProviderRegistry } from './oauth/identity-provider.registry';
import { OAuthException } from './oauth/oauth.exception';
import type { IdentityProvider } from './oauth/providers/identity-provider';
import type { SessionRequest } from './session/session.types';

@Module({})
class AuthFixtureModule {}

const applications = new Set<INestApplication>();
afterEach(async () => {
  await Promise.all([...applications].map((app) => app.close()));
  applications.clear();
  vi.unstubAllEnvs();
});

const fakeIdentity = (name: string) =>
  ({
    authorizationUrl: vi.fn(
      (_input: Parameters<IdentityProvider['authorizationUrl']>[0]) => `https://identity.example/${name}`,
    ),
    exchange: vi.fn(async (_code: string, _verifier: string, _nonce: string) => `${name}-subject`),
  }) satisfies IdentityProvider;

/** 실제 DB 클라이언트를 만들지 않고 OAuth의 영속화 경계만 대체한다. */
const fixture = async (options: AppOptions = {}) => {
  const attempts = new Map<string, Prisma.OAuthAttemptCreateInput>();
  const db = {
    $connect: vi.fn(() => {
      throw new Error('This fixture must never connect to a database.');
    }),
    oAuthAttempt: {
      create: vi.fn(async ({ data }: { data: Prisma.OAuthAttemptCreateInput }) => {
        attempts.set(data.stateHash, data);
        return data;
      }),
      findUnique: vi.fn(async ({ where }: { where: { stateHash: string } }) => attempts.get(where.stateHash)),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  const config = {
    ...resolveAppConfig({
      databaseUrl: 'postgresql://game_feedback:fixture@localhost:55444/game_feedback_test?schema=gf_test_di',
      webOrigin: 'http://localhost:3300',
      mediaStorage: { bucket: 'unused-fixture', region: 'ap-northeast-2', forcePathStyle: false },
      ...options,
    }),
    cacheRevalidation: undefined,
  };
  const app = await NestFactory.create(
    {
      module: AuthFixtureModule,
      imports: [
        DatabaseModule.register(config, db as unknown as PrismaClient),
        CacheInvalidationModule,
        AuthModule,
      ],
    },
    createHttpAdapter(),
    { logger: false, abortOnError: false },
  );
  applications.add(app);
  configureHttp(app);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.use((req: SessionRequest, _res: Response, next: NextFunction) => {
    req.gfSession = {
      id: 'pending-session',
      tokenHash: 'fixture',
      userId: null,
      user: null,
      pendingSubject: 'pending-subject',
      pendingProvider: 'google',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    };
    next();
  });
  await app.init();
  return { app, db, http: request(app.getHttpServer()) };
};

describe('auth module strategy wiring without DB or external services', () => {
  it('uses AppOptions strategies in AuthService and advertises the same selection in SessionService', async () => {
    const google = fakeIdentity('google');
    const kakao = fakeIdentity('kakao');
    const discord = fakeIdentity('discord');
    const legacy = fakeIdentity('legacy');
    const { app, db, http } = await fixture({
      identityProvider: legacy,
      identityProviders: { google, kakao, discord },
    });
    const registry = app.get(IdentityProviderRegistry);
    expect(registry.require('google')).toBe(google);
    expect(app.get(IDENTITY_PROVIDERS)).toEqual({ google, kakao, discord });
    const session = await http.get('/api/session').expect(200);
    expect(session.body.googleConfigured).toBe(true);
    expect(session.body.socialProviders).toEqual(registry.availability());
    for (const [provider, strategy] of Object.entries({ google, kakao, discord })) {
      const response = await http.get(`/api/auth/social/${provider}`).expect(302);
      expect(responseLocation(response)).toBe(`https://identity.example/${provider}`);
      expect(strategy.authorizationUrl).toHaveBeenCalledOnce();
      expect(strategy.authorizationUrl).toHaveBeenCalledWith({
        state: expect.any(String),
        nonce: expect.any(String),
        challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      });
    }
    expect(legacy.authorizationUrl).not.toHaveBeenCalled();
    expect(db.$connect).not.toHaveBeenCalled();
  });

  it('preserves the legacy single Google fake and explicit map disabling', async () => {
    const google = fakeIdentity('legacy');
    const first = await fixture({ identityProvider: google });
    expect(first.app.get(IdentityProviderRegistry).require('google')).toBe(google);
    const disabled = await fixture({ identityProvider: google, identityProviders: { google: undefined } });
    const response = await disabled.http.get('/api/auth/google').expect(503);
    expect(response.body).toEqual({
      errorCode: 'OAUTH_NOT_CONFIGURED',
      message: '소셜 로그인이 아직 설정되지 않았습니다.',
    });
    expect(disabled.db.oAuthAttempt.create).not.toHaveBeenCalled();
    const session = await disabled.http.get('/api/session').expect(200);
    expect(session.body.googleConfigured).toBe(false);
  });

  it('keeps OAuth exchange failures in the existing HTTP error envelope', async () => {
    const google = fakeIdentity('google');
    google.exchange.mockRejectedValue(OAuthException.exchangeFailed('Google'));
    const { http } = await fixture({ identityProvider: google });
    const start = await http.get('/api/auth/google').expect(302);
    const state = google.authorizationUrl.mock.calls[0]?.[0]?.state;
    const response = await http
      .get('/api/auth/google/callback')
      .query({ state, code: 'code' })
      .set('Cookie', responseCookies(start))
      .expect(502);
    expect(response.body).toEqual({
      errorCode: 'OAUTH_FAILED',
      message: 'Google 로그인에 실패했습니다. 다시 시도해주세요.',
    });
    expect(google.exchange).toHaveBeenCalledWith('code', expect.any(String), expect.any(String));
  });

  it('prefers the explicit profile fake even in demo mode and keeps typed upstream exceptions', async () => {
    const profile = new DemoProfileProvider();
    const lookup = vi.spyOn(profile, 'lookup');
    const { app, http } = await fixture({ demoMode: true, profileProvider: profile });
    expect(app.get(PROFILE_PROVIDER)).toBe(profile);
    await http.get('/api/game-profiles/%239QY82JGY').expect(200);
    expect(lookup).toHaveBeenCalledWith('#9QY82JGY');
    lookup.mockRejectedValueOnce(ProfileException.playerNotFound());
    const response = await http.get('/api/game-profiles/%2388888888').expect(404);
    expect(response.body).toEqual({ errorCode: 'PLAYER_NOT_FOUND', message: '플레이어를 찾을 수 없습니다.' });
    lookup.mockRejectedValueOnce(ProfileException.unavailable());
    const unavailable = await http.get('/api/game-profiles/%2399999999').expect(503);
    expect(unavailable.body).toEqual({
      errorCode: 'PROFILE_UNAVAILABLE',
      message: '게임 프로필을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.',
    });
  });

  it('returns the existing profile-not-configured response without a provider or DB query', async () => {
    const { app, http, db } = await fixture();
    expect(app.get(PROFILE_PROVIDER)).toBeNull();
    const response = await http.get('/api/game-profiles/%239QY82JGY').expect(503);
    expect(response.body).toEqual({
      errorCode: 'PROFILE_UNAVAILABLE',
      message: '게임 API가 아직 설정되지 않았습니다.',
    });
    expect(db.$connect).not.toHaveBeenCalled();
  });
});
