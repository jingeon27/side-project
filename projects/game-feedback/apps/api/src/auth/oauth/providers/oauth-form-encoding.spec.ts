import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoogleIdentityProvider } from './google-identity.provider';
import { createDiscordIdentityProvider, createKakaoIdentityProvider } from './oauth-identity.provider';

// 인코딩이 달라지기 쉬운 문자를 모두 넣어 제공자가 받는 이름과 값이 그대로인지 다른 파서로 확인한다.
const TRICKY = "a b+c/d=e&f~g*h(i)!'j?k#l%m한";
const client = {
  clientId: `client ${TRICKY}`,
  clientSecret: `secret ${TRICKY}`,
  redirectUri: 'https://feedback.example/api/auth/callback?from=app&label=a b',
};
const input = { state: `state ${TRICKY}`, nonce: `nonce ${TRICKY}`, challenge: `challenge ${TRICKY}` };

function entries(params: URLSearchParams) {
  return [...params.entries()];
}

function rejectedTokenExchange() {
  const fetcher = vi.fn(async () => new Response('{}', { status: 400 }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

function tokenRequest(fetcher: ReturnType<typeof rejectedTokenExchange>) {
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  return new Request(url, init);
}

afterEach(() => vi.unstubAllGlobals());

describe('Google OAuth 쿼리 인코딩', () => {
  const provider = new GoogleIdentityProvider(client.clientId, client.clientSecret, client.redirectUri);

  it('인증 URL의 이름·값·순서를 그대로 보내야 한다', () => {
    const url = new URL(provider.authorizationUrl(input));
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(entries(url.searchParams)).toEqual([
      ['client_id', client.clientId],
      ['redirect_uri', client.redirectUri],
      ['response_type', 'code'],
      ['scope', 'openid'],
      ['state', input.state],
      ['nonce', input.nonce],
      ['code_challenge', input.challenge],
      ['code_challenge_method', 'S256'],
    ]);
  });

  it('토큰 교환을 폼 문자열과 명시한 Content-Type으로 보내야 한다', async () => {
    const fetcher = rejectedTokenExchange();
    await expect(provider.exchange(`code ${TRICKY}`, `verifier ${TRICKY}`, 'nonce')).rejects.toThrow();
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(typeof init.body).toBe('string');
    expect(init.body).toContain('code=code+a+b%2Bc');
    const request = tokenRequest(fetcher);
    expect(request.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(entries(new URLSearchParams(await request.text()))).toEqual([
      ['code', `code ${TRICKY}`],
      ['client_id', client.clientId],
      ['client_secret', client.clientSecret],
      ['redirect_uri', client.redirectUri],
      ['grant_type', 'authorization_code'],
      ['code_verifier', `verifier ${TRICKY}`],
    ]);
  });
});

describe.each([
  {
    name: '카카오',
    create: createKakaoIdentityProvider,
    authorize: 'https://kauth.kakao.com/oauth/authorize',
    scope: [],
  },
  {
    name: 'Discord',
    create: createDiscordIdentityProvider,
    authorize: 'https://discord.com/oauth2/authorize',
    scope: [['scope', 'identify']],
  },
])('$name OAuth 쿼리 인코딩', ({ create, authorize, scope }) => {
  it('인증 URL의 이름·값·순서를 그대로 보내고 쓰지 않는 값은 빼야 한다', () => {
    const url = new URL(create(client).authorizationUrl(input));
    expect(`${url.origin}${url.pathname}`).toBe(authorize);
    expect(entries(url.searchParams)).toEqual([
      ['client_id', client.clientId],
      ['redirect_uri', client.redirectUri],
      ['response_type', 'code'],
      ['state', input.state],
      ...scope,
    ]);
  });

  it('토큰 교환을 폼 문자열과 명시한 Content-Type으로 보내야 한다', async () => {
    const fetcher = rejectedTokenExchange();
    await expect(create(client).exchange(`code ${TRICKY}`, 'verifier', 'nonce')).rejects.toThrow();
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(typeof init.body).toBe('string');
    const request = tokenRequest(fetcher);
    expect(request.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(entries(new URLSearchParams(await request.text()))).toEqual([
      ['code', `code ${TRICKY}`],
      ['grant_type', 'authorization_code'],
      ['redirect_uri', client.redirectUri],
      ['client_id', client.clientId],
      ['client_secret', client.clientSecret],
    ]);
  });
});
