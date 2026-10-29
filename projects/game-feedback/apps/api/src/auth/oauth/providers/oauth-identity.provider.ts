import { z } from 'zod';

import { OAuthException } from '../oauth.exception';
import type { IdentityProvider } from './identity-provider';

interface IOAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}
interface IOAuthProvider {
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  userUrl: string;
  scope?: string;
  subject: (value: unknown) => string;
}

class OAuthIdentityProvider implements IdentityProvider {
  constructor(
    private readonly client: IOAuthClient,
    private readonly provider: IOAuthProvider,
  ) {}

  authorizationUrl({ state }: { state: string; nonce: string; challenge: string }) {
    const query = new URLSearchParams({
      client_id: this.client.clientId,
      redirect_uri: this.client.redirectUri,
      response_type: 'code',
      state,
    });
    if (this.provider.scope) query.set('scope', this.provider.scope);
    return `${this.provider.authorizeUrl}?${query}`;
  }

  async exchange(code: string) {
    try {
      const body = new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.client.redirectUri,
        client_id: this.client.clientId,
        client_secret: this.client.clientSecret,
      });
      const response = await fetch(this.provider.tokenUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      if (!response.ok) throw new Error('Token exchange failed');
      const { access_token } = z.object({ access_token: z.string().min(1) }).parse(await response.json());
      const user = await fetch(this.provider.userUrl, {
        headers: { authorization: `Bearer ${access_token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!user.ok) throw new Error('Identity lookup failed');
      return this.provider.subject(await user.json());
    } catch {
      throw OAuthException.exchangeFailed(this.provider.name);
    }
  }
}

const subjectId = z.string().regex(/^\d+$/).max(255);
export function createKakaoIdentityProvider(client: IOAuthClient): IdentityProvider {
  return new OAuthIdentityProvider(client, {
    name: '카카오',
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    userUrl: 'https://kapi.kakao.com/v2/user/me?property_keys=%5B%5D',
    subject: (value) =>
      String(z.object({ id: z.union([subjectId, z.number().int().positive().safe()]) }).parse(value).id),
  });
}
export function createDiscordIdentityProvider(client: IOAuthClient): IdentityProvider {
  return new OAuthIdentityProvider(client, {
    name: 'Discord',
    authorizeUrl: 'https://discord.com/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userUrl: 'https://discord.com/api/v10/users/@me',
    scope: 'identify',
    subject: (value) => z.object({ id: subjectId }).parse(value).id,
  });
}
