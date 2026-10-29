import type { IdentityProvider, TIdentityProviders } from '../auth/oauth/providers/identity-provider';
import {
  resolveCacheRevalidationConfig,
  type ICacheRevalidationConfig,
} from '../cache-invalidation/cache-invalidation.config';
import { forwardedClientKey } from '../common/http/forwarded-client';
import { assertDatabaseUrl } from '../database/database-url';
import type { ProfileProvider } from '../game-profiles/providers/profile-provider';
import type { PrismaClient } from '../generated/prisma';
import { resolveMediaStorageConfig, type TMediaStorageConfig } from '../media-storage/media-storage.config';
import { resolveAppAuthCallbackUrl } from './app-auth-callback';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppOptions {
  cacheRevalidation?: ICacheRevalidationConfig;
  /** Verifies the client address the web server forwards. Defaults to the cache revalidation secret. */
  forwardedClientSecret?: string;
  databaseUrl?: string;
  webOrigin?: string;
  /** 테스트에서 검증할 앱 로그인 콜백. 기본은 WEB_ORIGIN/app-auth/callback이다. */
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
  /** 명시적 override만 보관하며 기본 전략 생성은 AuthModule의 Nest factory가 담당한다. */
  identityProvider?: IdentityProvider;
  identityProviders: TIdentityProviders;
  profileProvider?: ProfileProvider;
  rateLimit: boolean;
  mediaStorage: TMediaStorageConfig;
}

export function resolveAppConfig(options: AppOptions): AppConfig {
  const production = process.env.ENVIRONMENT === 'production';
  const demoMode = options.demoMode ?? false;
  const testAuthEnabled = options.testAuthEnabled ?? demoMode;
  if (production && demoMode) throw new Error('Demo authentication is forbidden in production.');
  if (production && testAuthEnabled) throw new Error('Test authentication is forbidden in production.');
  const webOrigin = options.webOrigin ?? process.env.WEB_ORIGIN ?? 'http://localhost:3300';
  if (new URL(webOrigin).origin !== webOrigin)
    throw new Error('WEB_ORIGIN must be an origin without a path.');
  if (production && !webOrigin.startsWith('https://'))
    throw new Error('Production WEB_ORIGIN must use HTTPS.');
  const appAuthCallbackUrl = resolveAppAuthCallbackUrl(options.appAuthCallbackUrl, webOrigin, production);

  const cacheRevalidation = options.cacheRevalidation ?? resolveCacheRevalidationConfig(process.env);
  const forwardedClientSecret = options.forwardedClientSecret ?? cacheRevalidation?.secret;
  return {
    mobilePush: {
      enabled: process.env.ENVIRONMENT !== 'test' && process.env.PUSH_NOTIFICATIONS_ENABLED === 'true',
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
    identityProvider: options.identityProvider,
    identityProviders: options.identityProviders ?? {},
    profileProvider: options.profileProvider,
  };
}
