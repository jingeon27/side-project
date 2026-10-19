import { z } from 'zod';
import { ApiError } from '../../common/http/api-error';
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
  pkce?: boolean;
  basicAuth?: boolean;
  subject: (value: unknown) => string;
}

class OAuthIdentityProvider implements IdentityProvider {
  constructor(
    private readonly client: IOAuthClient,
    private readonly provider: IOAuthProvider,
  ) {}

  authorizationUrl({ state, challenge }: { state: string; nonce: string; challenge: string }) {
    const query = new URLSearchParams({
      client_id: this.client.clientId,
      redirect_uri: this.client.redirectUri,
      response_type: 'code',
      state,
    });
    if (this.provider.scope) query.set('scope', this.provider.scope);
    if (this.provider.pkce) {
      query.set('code_challenge', challenge);
      query.set('code_challenge_method', 'S256');
    }
    return `${this.provider.authorizeUrl}?${query}`;
  }

  async exchange(code: string, verifier: string) {
    try {
      const body = new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.client.redirectUri,
      });
      if (!this.provider.basicAuth) {
        body.set('client_id', this.client.clientId);
        body.set('client_secret', this.client.clientSecret);
      }
      if (this.provider.pkce) body.set('code_verifier', verifier);
      const response = await fetch(this.provider.tokenUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          ...(this.provider.basicAuth
            ? {
                authorization: `Basic ${Buffer.from(`${this.client.clientId}:${this.client.clientSecret}`).toString('base64')}`,
              }
            : {}),
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
      throw new ApiError(
        502,
        'OAUTH_FAILED',
        `${this.provider.name} 로그인에 실패했습니다. 다시 시도해주세요.`,
      );
    }
  }
}

const subjectId = z.string().regex(/^\d+$/).max(255);
export function createXIdentityProvider(client: IOAuthClient): IdentityProvider {
  return new OAuthIdentityProvider(client, {
    name: 'X',
    authorizeUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    userUrl: 'https://api.x.com/2/users/me',
    scope: 'tweet.read users.read',
    pkce: true,
    basicAuth: true,
    subject: (value) => z.object({ data: z.object({ id: subjectId }) }).parse(value).data.id,
  });
}
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
