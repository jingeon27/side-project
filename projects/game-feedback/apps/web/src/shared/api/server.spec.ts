import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readRuntimeSecret } from '@/shared/config/runtime-secret.server';

import { forwardedClientHeaders, publicServerOptions, serverRequestOptions } from './server';

vi.mock('@/shared/config/runtime-secret.server', () => ({ readRuntimeSecret: vi.fn() }));

const { getCookie, getHeader } = vi.hoisted(() => ({ getCookie: vi.fn(), getHeader: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: getCookie }),
  headers: async () => ({ get: getHeader }),
}));
const secret = 'test-only-forwarded-client-secret-'.repeat(2);
beforeEach(() => {
  vi.stubEnv('GAME_FEEDBACK_API_URL', 'https://api.feedback.example');
  vi.mocked(readRuntimeSecret).mockReturnValue(secret);
});
afterEach(() => {
  vi.unstubAllEnvs();
  getCookie.mockReset();
  getHeader.mockReset();
});

describe('server-side API request options', () => {
  it('forwards only the Game Feedback session cookie and the signed visitor address', async () => {
    getCookie.mockReturnValue({ value: 'test-only-session' });
    getHeader.mockReturnValue('203.0.113.7, 10.0.0.2');
    const options = await serverRequestOptions();
    expect(options.baseUrl).toBe('https://api.feedback.example');
    expect(options.headers).toMatchObject({
      Cookie: 'gamefeedback_session=test-only-session',
      'x-gf-client-ip': '203.0.113.7',
      'x-gf-client-timestamp': expect.stringMatching(/^\d+$/),
      'x-gf-client-signature': expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(getCookie).toHaveBeenCalledExactlyOnceWith('gamefeedback_session');
    expect(getHeader).toHaveBeenCalledExactlyOnceWith('x-forwarded-for');
  });
  it('does not invent authentication or a visitor address', async () => {
    getCookie.mockReturnValue(undefined);
    for (const forwardedFor of [null, '', 'unknown', 'not-an-ip, 203.0.113.7']) {
      getHeader.mockReturnValue(forwardedFor);
      expect((await serverRequestOptions()).headers).toEqual({});
    }
  });
  it('marks cookie-free shared reads as internal so they do not use one visitor budget', () => {
    expect(publicServerOptions().headers).toMatchObject({ 'x-gf-client-ip': 'internal' });
    expect(publicServerOptions().headers).not.toHaveProperty('Cookie');
  });
  it('signs exactly like the API verifier and stays unsigned without the shared secret', () => {
    // apps/api/src/common/http/forwarded-client.spec.ts pins the same values.
    expect(forwardedClientHeaders('203.0.113.7', 1_790_000_000_000)).toEqual({
      'x-gf-client-ip': '203.0.113.7',
      'x-gf-client-timestamp': '1790000000',
      'x-gf-client-signature': 'n9UQhANQ7tvKVif30IeU53YT5kjP3-iFSdYTrWWBkkQ',
    });
    expect(forwardedClientHeaders('internal', 1_790_000_000_999)['x-gf-client-signature']).toBe(
      '3TpEMy8avP8vg8wlqDs9tnRyaZdM0b8tEseX0Jkdf74',
    );
    vi.mocked(readRuntimeSecret).mockReturnValue(undefined);
    expect(forwardedClientHeaders('203.0.113.7')).toEqual({});
    expect(publicServerOptions().headers).toEqual({});
  });
  it('does not accept an API origin containing credentials or a path', () => {
    for (const invalid of [
      'javascript:alert(1)',
      'https://user:pass@api.feedback.example',
      'https://api.feedback.example/other',
    ]) {
      vi.stubEnv('GAME_FEEDBACK_API_URL', invalid);
      expect(() => publicServerOptions()).toThrow('origin is invalid');
    }
  });
});
