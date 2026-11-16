import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DemoProfileProvider } from '../../game-profiles/providers/demo-profile.provider';
import { PROFILE_PROVIDER, profileProvider } from '../../game-profiles/providers/profile-provider.factory';
import { SupercellProfileProvider } from '../../game-profiles/providers/supercell-profile.provider';
import {
  IDENTITY_PROVIDERS,
  IdentityProviderRegistry,
  identityProvidersProvider,
} from './identity-provider.registry';
import { OAuthException } from './oauth.exception';
import type { IdentityProvider } from './providers/identity-provider';

@Module({})
class StrategyFixtureModule {}

type TStrategyConfig = Pick<
  AppConfig,
  'webOrigin' | 'demoMode' | 'testAuthEnabled' | 'identityProvider' | 'identityProviders' | 'profileProvider'
>;
const contexts = new Set<INestApplicationContext>();
afterEach(async () => {
  await Promise.all([...contexts].map((context) => context.close()));
  contexts.clear();
  vi.unstubAllEnvs();
});

const fakeIdentity = (name: string) =>
  ({
    authorizationUrl: vi.fn(
      (_input: Parameters<IdentityProvider['authorizationUrl']>[0]) => `https://identity.example/${name}`,
    ),
    exchange: vi.fn(async (_code: string, _verifier: string, _nonce: string) => `${name}-subject`),
  }) satisfies IdentityProvider;

const fixture = async (options: Partial<TStrategyConfig> = {}) => {
  const config = {
    webOrigin: 'http://localhost:3300',
    demoMode: false,
    testAuthEnabled: false,
    identityProviders: {},
    ...options,
  } satisfies TStrategyConfig;
  const context = await NestFactory.createApplicationContext(
    {
      module: StrategyFixtureModule,
      providers: [
        { provide: APP_CONFIG, useValue: config },
        identityProvidersProvider,
        IdentityProviderRegistry,
        profileProvider,
      ],
    },
    { logger: false, abortOnError: false },
  );
  contexts.add(context);
  return context;
};

describe('strategy provider DI without HTTP, Prisma or external requests', () => {
  it('selects explicit strategies by provider and advertises the same availability', async () => {
    const google = fakeIdentity('google');
    const kakao = fakeIdentity('kakao');
    const legacy = fakeIdentity('legacy');
    const context = await fixture({ identityProvider: legacy, identityProviders: { google, kakao } });
    const registry = context.get(IdentityProviderRegistry);
    expect(registry.require('google')).toBe(google);
    expect(registry.require('kakao')).toBe(kakao);
    expect(context.get(IDENTITY_PROVIDERS)).toMatchObject({ google, kakao });
    expect(registry.availability()).toEqual([
      { provider: 'kakao', configured: true },
      { provider: 'discord', configured: false },
      { provider: 'google', configured: true },
    ]);
    await expect(registry.require('kakao').exchange('code', 'verifier', 'nonce')).resolves.toBe(
      'kakao-subject',
    );
    expect(kakao.exchange).toHaveBeenCalledWith('code', 'verifier', 'nonce');
    expect(legacy.exchange).not.toHaveBeenCalled();
  });

  it('keeps the legacy Google override and permits explicitly disabling it in the map', async () => {
    const google = fakeIdentity('legacy');
    const first = await fixture({ identityProvider: google });
    expect(first.get(IdentityProviderRegistry).require('google')).toBe(google);
    const disabled = await fixture({ identityProvider: google, identityProviders: { google: undefined } });
    const registry = disabled.get(IdentityProviderRegistry);
    expect(registry.configured('google')).toBe(false);
    expect(() => registry.require('google')).toThrow(OAuthException);
  });

  it('supports replacing the token with an existing Nest useValue provider', async () => {
    const google = fakeIdentity('replacement');
    const context = await NestFactory.createApplicationContext(
      {
        module: StrategyFixtureModule,
        providers: [{ provide: IDENTITY_PROVIDERS, useValue: { google } }, IdentityProviderRegistry],
      },
      { logger: false, abortOnError: false },
    );
    contexts.add(context);
    expect(context.get(IdentityProviderRegistry).require('google')).toBe(google);
  });

  it('constructs configured OAuth strategies with the existing Google callback and scope', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'fixture-client');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'fixture-secret');
    const context = await fixture();
    const strategy = context.get(IdentityProviderRegistry).require('google');
    const url = new URL(
      strategy.authorizationUrl({ state: 'state', nonce: 'nonce', challenge: 'challenge' }),
    );
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3300/api/auth/google/callback');
    expect(url.searchParams.get('scope')).toBe('openid');
  });

  it('reports unconfigured strategies and a null profile provider', async () => {
    const context = await fixture();
    const registry = context.get(IdentityProviderRegistry);
    expect(registry.availability().every((entry) => !entry.configured)).toBe(true);
    expect(context.get(PROFILE_PROVIDER)).toBeNull();
    expect(() => registry.require('discord')).toThrow(OAuthException);
  });

  it.each([
    { demoMode: true, testAuthEnabled: false, token: 'fixture-token', expected: DemoProfileProvider },
    { demoMode: false, testAuthEnabled: true, token: 'fixture-token', expected: SupercellProfileProvider },
    { demoMode: false, testAuthEnabled: true, token: '', expected: DemoProfileProvider },
  ])(
    'selects the profile implementation for demo=$demoMode test=$testAuthEnabled token=$token',
    async ({ token, expected, ...options }) => {
      vi.stubEnv('SUPERCELL_API_TOKEN', token);
      const context = await fixture(options);
      expect(context.get(PROFILE_PROVIDER)).toBeInstanceOf(expected);
    },
  );

  it('keeps the explicit profile fake ahead of demo and environment defaults', async () => {
    vi.stubEnv('SUPERCELL_API_TOKEN', 'fixture-token');
    const profile = new DemoProfileProvider();
    const context = await fixture({ demoMode: true, profileProvider: profile });
    expect(context.get(PROFILE_PROVIDER)).toBe(profile);
  });
});
