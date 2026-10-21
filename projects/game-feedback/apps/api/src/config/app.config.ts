import type { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from '../database/database-url';
import type { IdentityProvider, TIdentityProviders } from '../auth/providers/identity-provider';
import { resolveIdentityProviders } from './identity-providers';
import type { ProfileProvider } from '../game-profiles/providers/profile-provider';
import { DemoProfileProvider } from '../game-profiles/providers/demo-profile.provider';
import { SupercellProfileProvider } from '../game-profiles/providers/supercell-profile.provider';
import { resolveMediaStorageConfig, type TMediaStorageConfig } from '../media-storage/media-storage.config';
import {
  resolveCacheRevalidationConfig,
  type ICacheRevalidationConfig,
} from '../cache-invalidation/cache-invalidation.config';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppOptions {
  cacheRevalidation?: ICacheRevalidationConfig;
  databaseUrl?: string;
  webOrigin?: string;
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
  cacheRevalidation?: ICacheRevalidationConfig;
  databaseUrl: string;
  production: boolean;
  demoMode: boolean;
  testAuthEnabled: boolean;
  webOrigin: string;
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

  const identityProviders = resolveIdentityProviders(
    webOrigin,
    options.identityProviders,
    options.identityProvider,
  );
  return {
    cacheRevalidation: options.cacheRevalidation ?? resolveCacheRevalidationConfig(process.env),
    databaseUrl: assertDatabaseUrl(options.databaseUrl ?? process.env.DATABASE_URL),
    production,
    demoMode,
    testAuthEnabled,
    webOrigin,
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
