import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDiscordIdentityProvider,
  createKakaoIdentityProvider,
  createXIdentityProvider,
} from './oauth-identity.provider';

afterEach(() => vi.unstubAllGlobals());
const client = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://feedback.example/callback',
};

describe('social provider adapters without external requests', () => {
  it.each([
    {
      create: createXIdentityProvider,
      host: 'x.com',
      scope: 'tweet.read users.read',
      body: { data: { id: '123' } },
      basic: true,
      pkce: true,
    },
    {
      create: createKakaoIdentityProvider,
      host: 'kauth.kakao.com',
      scope: null,
      body: { id: 123 },
      basic: false,
      pkce: false,
    },
    {
      create: createDiscordIdentityProvider,
      host: 'discord.com',
      scope: 'identify',
      body: { id: '123' },
      basic: false,
      pkce: false,
    },
  ])(
    'exchanges a code for only the identity on $host',
    async ({ create, host, scope, body, basic, pkce }) => {
      const provider = create(client);
      const authorize = new URL(
        provider.authorizationUrl({ state: 'state', nonce: 'nonce', challenge: 'challenge' }),
      );
      expect(authorize.hostname).toBe(host);
      expect(authorize.searchParams.get('state')).toBe('state');
      expect(authorize.searchParams.get('scope')).toBe(scope);
      expect(authorize.searchParams.get('code_challenge')).toBe(pkce ? 'challenge' : null);
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ access_token: 'provider-token' }))
        .mockResolvedValueOnce(Response.json(body));
      vi.stubGlobal('fetch', fetcher);
      expect(await provider.exchange('code', 'verifier', 'nonce')).toBe('123');
      const [tokenCall, profileCall] = fetcher.mock.calls;
      const options = tokenCall?.[1];
      expect(options.body.get('code')).toBe('code');
      expect(options.body.get('code_verifier')).toBe(pkce ? 'verifier' : null);
      expect(!!options.headers.authorization).toBe(basic);
      expect(profileCall?.[1].headers.authorization).toBe('Bearer provider-token');
      expect(authorize.searchParams.get('scope') ?? '').not.toMatch(/email|offline|write/);
    },
  );

  it('rejects malformed identities and does not expose provider token payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ access_token: 'secret' }))
        .mockResolvedValueOnce(Response.json({ data: { id: null, email: 'private@example.com' } })),
    );
    await expect(createXIdentityProvider(client).exchange('code', 'verifier', 'nonce')).rejects.toMatchObject(
      { message: 'X 로그인에 실패했습니다. 다시 시도해주세요.' },
    );
  });
});
