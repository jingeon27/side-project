import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { publicServerOptions, serverRequestOptions } from './server';
const { getCookie, getHeaders } = vi.hoisted(() => ({ getCookie: vi.fn(), getHeaders: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: getCookie }), headers: getHeaders }));
beforeEach(() => {
  vi.stubEnv('GF_PROXY_SECRET', '');
  getHeaders.mockResolvedValue(new Headers());
});
afterEach(() => {
  vi.unstubAllEnvs();
  getCookie.mockReset();
  getHeaders.mockReset();
});
it('forwards only the visitor IP authenticated by Caddy and leaves public cache fills request-independent', async () => {
  const secret = 'a'.repeat(64);
  vi.stubEnv('GF_PROXY_SECRET', secret);
  getHeaders.mockResolvedValue(
    new Headers({
      'x-game-feedback-proxy-secret': secret,
      'x-game-feedback-client-ip': '203.0.113.10',
      'x-forwarded-for': '198.51.100.99',
      authorization: 'Bearer must-not-be-forwarded',
    }),
  );
  expect((await serverRequestOptions()).headers).toEqual({
    'x-game-feedback-proxy-secret': secret,
    'x-game-feedback-client-ip': '203.0.113.10',
  });
  getHeaders.mockClear();
  expect(publicServerOptions().headers).toEqual({ 'x-game-feedback-proxy-secret': secret });
  expect(getHeaders).not.toHaveBeenCalled();
});
it.each<Record<string, string>>([
  { 'x-game-feedback-proxy-secret': 'b'.repeat(64), 'x-game-feedback-client-ip': '203.0.113.10' },
  { 'x-game-feedback-client-ip': '203.0.113.10', 'x-forwarded-for': '203.0.113.10' },
  {
    'x-game-feedback-proxy-secret': 'a'.repeat(64),
    'x-game-feedback-client-ip': '203.0.113.10, 203.0.113.11',
  },
])('does not authenticate a forged or malformed visitor identity: %j', async (source) => {
  vi.stubEnv('GF_PROXY_SECRET', 'a'.repeat(64));
  getHeaders.mockResolvedValue(new Headers(source));
  expect((await serverRequestOptions()).headers).toBeUndefined();
});
it('uses the configured API origin and forwards only the Game Feedback session cookie', async () => {
  vi.stubEnv('GAME_FEEDBACK_API_URL', 'https://api.feedback.example');
  getCookie.mockReturnValue({ value: 'test-only-session' });
  const options = await serverRequestOptions();
  expect(options).toMatchObject({
    baseUrl: 'https://api.feedback.example',
    headers: { Cookie: 'gamefeedback_session=test-only-session' },
  });
  expect(getCookie).toHaveBeenCalledExactlyOnceWith('gamefeedback_session');
  expect(publicServerOptions()).not.toHaveProperty('headers');
});
it('does not invent authentication or accept an API origin containing credentials or a path', async () => {
  vi.stubEnv('GAME_FEEDBACK_API_URL', 'https://api.feedback.example');
  getCookie.mockReturnValue(undefined);
  expect((await serverRequestOptions()).headers).toBeUndefined();
  for (const invalid of [
    'javascript:alert(1)',
    'https://user:pass@api.feedback.example',
    'https://api.feedback.example/other',
  ]) {
    vi.stubEnv('GAME_FEEDBACK_API_URL', invalid);
    expect(() => publicServerOptions()).toThrow('origin is invalid');
  }
});
