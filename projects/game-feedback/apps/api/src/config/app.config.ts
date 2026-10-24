import type { IdentityProvider, TIdentityProviders } from '../auth/providers/identity-provider';
import {
  resolveCacheRevalidationConfig,
  type ICacheRevalidationConfig,
} from '../cache-invalidation/cache-invalidation.config';
import { forwardedClientKey } from '../common/http/forwarded-client';
import { assertDatabaseUrl } from '../database/database-url';
import { DemoProfileProvider } from '../game-profiles/providers/demo-profile.provider';
import type { ProfileProvider } from '../game-profiles/providers/profile-provider';
import { SupercellProfileProvider } from '../game-profiles/providers/supercell-profile.provider';
import type { PrismaClient } from '../generated/prisma';
import { resolveMediaStorageConfig, type TMediaStorageConfig } from '../media-storage/media-storage.config';
import { resolveAppAuthCallbackUrl } from './app-auth-callback';
import { resolveIdentityProviders } from './identity-providers';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppOptions {
  cacheRevalidation?: ICacheRevalidationConfig;
  /** Verifies the client address the web server forwards. Defaults to the cache revalidation secret. */
  forwardedClientSecret?: string;
  databaseUrl?: string;
  webOrigin?: string;
  /** 앱 로그인 https 콜백. 없으면 MOBILE_AUTH_CALLBACK_URL, 개발·테스트는 WEB_ORIGIN/app-auth/callback */
  appAuthCallbackUrl?: string;
  demoMode?: boolean;
  testAuthEnabled?: boolean;
  identityProvider?: IdentityProvider;
  identityProviders?: TIdentityProviders;
  profileProvider?: ProfileProvider;
  rateLimit?: boolean;
  logger?: false;
  prisma?: PrismaClient;
  mediaStorage?: TMediaStorageConfig;
}

export interface AppConfig {
  mobilePush: { enabled: boolean; accessToken?: string };
  cacheRevalidation?: ICacheRevalidationConfig;
  forwardedClientKey?: Buffer;
  databaseUrl: string;
  production: boolean;
  demoMode: boolean;
  testAuthEnabled: boolean;
  webOrigin: string;
  /** 앱 로그인 일회용 코드를 보내는 검증된 https 콜백(App Link·Universal Link) */
  appAuthCallbackUrl: string;
  identityProvider?: IdentityProvider;
  identityProviders: TIdentityProviders;
  profileProvider?: ProfileProvider;
  rateLimit: boolean;
  mediaStorage: TMediaStorageConfig;
}

export function resolveAppConfig(options: AppOptions): AppConfig {
  const production = process.env.NODE_ENV === 'production';
  const demoMode = options.demoMode ?? process.env.GF_DEMO_MODE === 'true';
  const testAuthEnabled =
    options.testAuthEnabled ?? (demoMode || process.env.GF_TEST_AUTH_ENABLED === 'true');
  if (production && demoMode) throw new Error('GF_DEMO_MODE is forbidden in production.');
  if (production && testAuthEnabled) throw new Error('GF_TEST_AUTH_ENABLED is forbidden in production.');
  const webOrigin = options.webOrigin ?? process.env.WEB_ORIGIN ?? 'http://localhost:3300';
  if (new URL(webOrigin).origin !== webOrigin)
    throw new Error('WEB_ORIGIN must be an origin without a path.');
  if (production && !webOrigin.startsWith('https://'))
    throw new Error('Production WEB_ORIGIN must use HTTPS.');
  const appAuthCallbackUrl = resolveAppAuthCallbackUrl(
    options.appAuthCallbackUrl ?? process.env.MOBILE_AUTH_CALLBACK_URL,
    webOrigin,
    production,
  );

  const identityProviders = resolveIdentityProviders(
    webOrigin,
    options.identityProviders,
    options.identityProvider,
  );
  const cacheRevalidation = options.cacheRevalidation ?? resolveCacheRevalidationConfig(process.env);
  const forwardedClientSecret = options.forwardedClientSecret ?? cacheRevalidation?.secret;
  return {
    mobilePush: {
      enabled: process.env.NODE_ENV !== 'test' && process.env.PUSH_NOTIFICATIONS_ENABLED === 'true',
      accessToken: process.env.EXPO_ACCESS_TOKEN,
    },
    cacheRevalidation,
    forwardedClientKey: forwardedClientSecret ? forwardedClientKey(forwardedClientSecret) : undefined,
    databaseUrl: assertDatabaseUrl(options.databaseUrl ?? process.env.DATABASE_URL),
    production,
    demoMode,
    testAuthEnabled,
    webOrigin,
    appAuthCallbackUrl,
    rateLimit: options.rateLimit !== false,
    mediaStorage: options.mediaStorage ?? resolveMediaStorageConfig(process.env),
    identityProvider: identityProviders.google,
    identityProviders,
    profileProvider:
      options.profileProvider ??
      (demoMode
        ? new DemoProfileProvider()
        : process.env.SUPERCELL_API_TOKEN
          ? new SupercellProfileProvider(process.env.SUPERCELL_API_TOKEN)
          : testAuthEnabled
            ? new DemoProfileProvider()
            : undefined),
  };
}
