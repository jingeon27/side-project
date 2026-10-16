import type { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from '../database/database-url';
import type { IdentityProvider } from '../auth/providers/identity-provider';
import { GoogleIdentityProvider } from '../auth/providers/google-identity.provider';
import type { ProfileProvider } from '../game-profiles/providers/profile-provider';
import { DemoProfileProvider } from '../game-profiles/providers/demo-profile.provider';
import { SupercellProfileProvider } from '../game-profiles/providers/supercell-profile.provider';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppOptions {
  databaseUrl?: string;
  webOrigin?: string;
  demoMode?: boolean;
  identityProvider?: IdentityProvider;
  profileProvider?: ProfileProvider;
  rateLimit?: boolean;
  logger?: false;
  prisma?: PrismaClient;
}

export interface AppConfig {
  databaseUrl: string;
  production: boolean;
  demoMode: boolean;
  webOrigin: string;
  identityProvider?: IdentityProvider;
  profileProvider?: ProfileProvider;
  rateLimit: boolean;
}

export function resolveAppConfig(options: AppOptions): AppConfig {
  const production = process.env.NODE_ENV === 'production';
  const demoMode = options.demoMode ?? process.env.GF_DEMO_MODE === 'true';
  if (production && demoMode) throw new Error('GF_DEMO_MODE is forbidden in production.');
  const webOrigin = options.webOrigin ?? process.env.WEB_ORIGIN ?? 'http://localhost:3300';
  if (new URL(webOrigin).origin !== webOrigin)
    throw new Error('WEB_ORIGIN must be an origin without a path.');
  if (production && !webOrigin.startsWith('https://'))
    throw new Error('Production WEB_ORIGIN must use HTTPS.');

  return {
    databaseUrl: assertDatabaseUrl(options.databaseUrl ?? process.env.DATABASE_URL),
    production,
    demoMode,
    webOrigin,
    rateLimit: options.rateLimit !== false,
    identityProvider:
      options.identityProvider ??
      (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? new GoogleIdentityProvider(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI ?? `${webOrigin}/api/auth/google/callback`,
          )
        : undefined),
    profileProvider:
      options.profileProvider ??
      (demoMode
        ? new DemoProfileProvider()
        : process.env.SUPERCELL_API_TOKEN
          ? new SupercellProfileProvider(process.env.SUPERCELL_API_TOKEN)
          : undefined),
  };
}
