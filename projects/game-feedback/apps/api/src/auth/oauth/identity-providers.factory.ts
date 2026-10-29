import { GoogleIdentityProvider } from './providers/google-identity.provider';
import type { IdentityProvider, TIdentityProviders } from './providers/identity-provider';
import {
  createDiscordIdentityProvider,
  createKakaoIdentityProvider,
} from './providers/oauth-identity.provider';

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
      redirectUri: `${webOrigin}${callback}`,
    };
  };
  const googleClient = configured('GOOGLE', '/api/auth/google/callback');
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
    kakao: kakao ? createKakaoIdentityProvider(kakao) : undefined,
    discord: discord ? createDiscordIdentityProvider(discord) : undefined,
    ...overrides,
  };
}
