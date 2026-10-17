import type { TIdentityProviders, IdentityProvider } from '../auth/providers/identity-provider';
import { GoogleIdentityProvider } from '../auth/providers/google-identity.provider';
import {
  createXIdentityProvider,
  createKakaoIdentityProvider,
  createDiscordIdentityProvider,
} from '../auth/providers/oauth-identity.provider';

export function resolveIdentityProviders(
  webOrigin: string,
  overrides?: TIdentityProviders,
  google?: IdentityProvider,
): TIdentityProviders {
  const configured = (prefix: string, callback: string) => {
    const clientId = process.env[`${prefix}_CLIENT_ID`];
    const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
    if (!clientId || !clientSecret) return undefined;
    return {
      clientId,
      clientSecret,
      redirectUri: process.env[`${prefix}_REDIRECT_URI`] ?? `${webOrigin}${callback}`,
    };
  };
  const googleClient = configured('GOOGLE', '/api/auth/google/callback');
  const x = configured('X', '/api/auth/social/x/callback');
  const kakao = configured('KAKAO', '/api/auth/social/kakao/callback');
  const discord = configured('DISCORD', '/api/auth/social/discord/callback');
  return {
    google:
      google ??
      (googleClient
        ? new GoogleIdentityProvider(
            googleClient.clientId,
            googleClient.clientSecret,
            googleClient.redirectUri,
          )
        : undefined),
    x: x ? createXIdentityProvider(x) : undefined,
    kakao: kakao ? createKakaoIdentityProvider(kakao) : undefined,
    discord: discord ? createDiscordIdentityProvider(discord) : undefined,
    ...overrides,
  };
}
