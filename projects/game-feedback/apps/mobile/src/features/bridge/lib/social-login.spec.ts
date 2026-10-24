import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { parseLoginCallback, socialLogin } from './social-login';

const verifier = 'a'.repeat(43);
const code = 'b'.repeat(43);
const callback = 'https://feedback.example/app-auth/callback';
describe('system-browser OAuth', () => {
  it.each(['google', 'x', 'kakao', 'discord'] as const)(
    'uses PKCE and the verified HTTPS app link callback for %s without exposing a session token',
    async (provider) => {
      const openSession = vi.fn(async (_url: string, _callback: string) => ({
        type: 'success',
        url: `${callback}?code=${code}`,
      }));
      const result = await socialLogin(
        'https://feedback.example',
        {
          randomVerifier: () => verifier,
          challenge: async (value) => createHash('sha256').update(value).digest('base64url'),
          openSession,
        },
        provider,
      );
      expect(openSession).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `^https://feedback\\.example/api/auth/social/${provider}\\?app_challenge=[A-Za-z0-9_-]{43}$`,
          ),
        ),
        callback,
      );
      expect(result).toEqual({ status: 'success', code, verifier });
      expect(openSession.mock.calls[0]?.[0]).not.toContain(verifier);
    },
  );
  it('treats cancellation quietly', async () => {
    expect(
      await socialLogin('https://feedback.example', {
        randomVerifier: () => verifier,
        challenge: async () => 'x',
        openSession: async () => ({ type: 'cancel' }),
      }),
    ).toEqual({ status: 'cancelled' });
  });
  it('accepts only the exact callback with one code, ignoring a carried-over fragment', () => {
    expect(parseLoginCallback(`${callback}?code=${code}`, verifier, callback)).toEqual({
      status: 'success',
      code,
      verifier,
    });
    expect(
      parseLoginCallback(`HTTPS://Feedback.Example/app-auth/callback?code=${code}#_=_`, verifier, callback),
    ).toEqual({ status: 'success', code, verifier });
  });
  it.each([
    `gamefeedback://auth/callback?code=${code}`,
    `https://evil.example/app-auth/callback?code=${code}`,
    `https://feedback.example.evil.example/app-auth/callback?code=${code}`,
    `https://feedback.example@evil.example/app-auth/callback?code=${code}`,
    `http://feedback.example/app-auth/callback?code=${code}`,
    `https://feedback.example/app-auth/callback/?code=${code}`,
    `https://feedback.example/app-auth/callbackx?code=${code}`,
    `https://feedback.example/ko/posts/1?code=${code}`,
    `${callback}?code=${code}&token=secret`,
    `${callback}?state=x&code=${code}`,
    `${callback}?code=${code.slice(1)}`,
    `${callback}#code=${code}`,
    `${callback}?error=login_failed`,
    callback,
  ])('rejects callback spoofing and malformed results: %s', (url) => {
    expect(parseLoginCallback(url, verifier, callback)).toEqual({ status: 'failed' });
  });
});
