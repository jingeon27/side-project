import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { parseLoginCallback, socialLogin } from './social-login';
const verifier = 'a'.repeat(43);
const code = 'b'.repeat(43);
describe('system-browser OAuth', () => {
  it('uses PKCE and the fixed application callback without exposing a session token', async () => {
    const openSession = vi.fn(async (_url: string, _callback: string) => ({
      type: 'success',
      url: `gamefeedback://auth/callback?code=${code}`,
    }));
    const result = await socialLogin('https://feedback.example', {
      randomVerifier: () => verifier,
      challenge: async (value) => createHash('sha256').update(value).digest('base64url'),
      openSession,
    });
    expect(openSession).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/feedback.example\/api\/auth\/google\?app_challenge=[A-Za-z0-9_-]{43}$/,
      ),
      'gamefeedback://auth/callback',
    );
    expect(result).toEqual({ status: 'success', code, verifier });
    expect(openSession.mock.calls[0]?.[0]).not.toContain(verifier);
  });
  it('treats cancellation quietly and rejects callback spoofing', async () => {
    expect(
      await socialLogin('https://feedback.example', {
        randomVerifier: () => verifier,
        challenge: async () => 'x',
        openSession: async () => ({ type: 'cancel' }),
      }),
    ).toEqual({ status: 'cancelled' });
    for (const url of [
      `https://evil.example/auth/callback?code=${code}`,
      `gamefeedback://auth/callback?code=${code}&token=secret`,
      'gamefeedback://auth/callback?error=login_failed',
    ])
      expect(parseLoginCallback(url, verifier)).toEqual({ status: 'failed' });
  });
});
