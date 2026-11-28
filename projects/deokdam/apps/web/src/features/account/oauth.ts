import { createHash } from 'node:crypto';

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

import type { TProvider } from './navigation';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const endpoints = {
  google: ['https://accounts.google.com/o/oauth2/v2/auth', 'https://oauth2.googleapis.com/token'],
  kakao: ['https://kauth.kakao.com/oauth/authorize', 'https://kauth.kakao.com/oauth/token'],
} as const;

export function oauthConfig(provider: TProvider) {
  const id = process.env['DEOKDAM_' + provider.toUpperCase() + '_CLIENT_ID']?.trim();
  const secret = process.env['DEOKDAM_' + provider.toUpperCase() + '_CLIENT_SECRET']?.trim();
  return id && secret ? { id, secret } : null;
}

export function authorizationUrl(
  provider: TProvider,
  id: string,
  redirectUri: string,
  flow: { state: string; nonce: string; verifier: string },
) {
  const url = new URL(endpoints[provider][0]);
  url.search = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: flow.state,
  }).toString();
  if (provider === 'google') {
    url.searchParams.set('scope', 'openid');
    url.searchParams.set('nonce', flow.nonce);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('code_challenge', createHash('sha256').update(flow.verifier).digest('base64url'));
  }
  return url;
}

export async function exchangeIdentity(
  provider: TProvider,
  config: { id: string; secret: string },
  redirectUri: string,
  code: string,
  flow: { verifier: string; nonce: string },
) {
  const body = new URLSearchParams({
    client_id: config.id,
    client_secret: config.secret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });
  if (provider === 'google') body.set('code_verifier', flow.verifier);
  const options = { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) } as const;
  const response = await fetch(endpoints[provider][1], { ...options, method: 'POST', body });
  if (!response.ok) throw new Error('Token exchange failed');
  const tokens: unknown = await response.json();
  if (provider === 'google') {
    const { id_token } = z.object({ id_token: z.string() }).parse(tokens);
    const { payload } = await jwtVerify(id_token, googleKeys, {
      algorithms: ['RS256'],
      audience: config.id,
      issuer: ['accounts.google.com', 'https://accounts.google.com'],
      requiredClaims: ['sub', 'iat', 'exp', 'nonce'],
      maxTokenAge: '1h',
    });
    if (
      payload.nonce !== flow.nonce ||
      ((Array.isArray(payload.aud) || payload.azp !== undefined) && payload.azp !== config.id)
    )
      throw new Error('Unexpected Google identity');
    return z.string().min(1).parse(payload.sub);
  }
  const { access_token } = z.object({ access_token: z.string().min(1) }).parse(tokens);
  const user = await fetch('https://kapi.kakao.com/v2/user/me?property_keys=%5B%5D', {
    ...options,
    headers: { authorization: 'Bearer ' + access_token },
  });
  if (!user.ok) throw new Error('Identity lookup failed');
  return String(z.object({ id: z.number().int().positive() }).parse(await user.json()).id);
}
