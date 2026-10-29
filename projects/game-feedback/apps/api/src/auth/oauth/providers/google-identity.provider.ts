import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';

import { ApiError } from '../../../common/http/api-error';
import type { IdentityProvider } from './identity-provider';

export class GoogleIdentityProvider implements IdentityProvider {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {}
  authorizationUrl(input: { state: string; nonce: string; challenge: string }) {
    const query = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid',
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.challenge,
      code_challenge_method: 'S256',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
  }
  async exchange(code: string, verifier: string, nonce: string) {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        }),
      });
      const data = (await response.json()) as { id_token?: string };
      if (!response.ok || !data.id_token) throw new Error('Token exchange failed');
      const [encodedHeader, encodedClaims, encodedSignature, ...extraParts] = data.id_token.split('.');
      if (
        encodedHeader === undefined ||
        encodedClaims === undefined ||
        encodedSignature === undefined ||
        extraParts.length > 0
      )
        throw new Error('Invalid ID token');
      const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString()) as {
        alg?: string;
        kid?: string;
      };
      if (header.alg !== 'RS256' || !header.kid) throw new Error('Invalid algorithm');
      const jwksResponse = await fetch('https://www.googleapis.com/oauth2/v3/certs', {
        signal: AbortSignal.timeout(10000),
      });
      if (!jwksResponse.ok) throw new Error('Key discovery failed');
      const jwks = (await jwksResponse.json()) as { keys: (JsonWebKey & { kid?: string })[] };
      const jwk = jwks.keys.find((key) => key.kid === header.kid);
      if (
        !jwk ||
        !verify(
          'RSA-SHA256',
          Buffer.from(`${encodedHeader}.${encodedClaims}`),
          createPublicKey({ key: jwk, format: 'jwk' }),
          Buffer.from(encodedSignature, 'base64url'),
        )
      )
        throw new Error('Invalid signature');
      const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString()) as {
        sub?: string;
        iss?: string;
        aud?: string | string[];
        azp?: string;
        exp?: number;
        iat?: number;
        nonce?: string;
      };
      const now = Date.now() / 1000;
      const audience = Array.isArray(claims.aud)
        ? claims.aud.includes(this.clientId) && claims.azp === this.clientId
        : claims.aud === this.clientId;
      if (
        !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss ?? '') ||
        !audience ||
        !claims.exp ||
        claims.exp < now ||
        !claims.iat ||
        claims.iat > now + 60 ||
        claims.nonce !== nonce ||
        !claims.sub
      )
        throw new Error('Invalid claims');
      return claims.sub;
    } catch {
      throw new ApiError(502, 'OAUTH_FAILED', 'Google 로그인에 실패했습니다. 다시 시도해주세요.');
    }
  }
}
