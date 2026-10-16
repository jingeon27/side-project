import { afterEach, expect, it, vi } from 'vitest';
import { publicServerOptions, serverRequestOptions } from './server';
const { getCookie } = vi.hoisted(() => ({ getCookie: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: getCookie }) }));
afterEach(() => {
  vi.unstubAllEnvs();
  getCookie.mockReset();
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
