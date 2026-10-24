import { afterEach, expect, it, vi } from 'vitest';
import { documentUnavailable } from './document-access.server';

const { getPost, listCategories } = vi.hoisted(() => ({ getPost: vi.fn(), listCategories: vi.fn() }));
vi.mock('@game-feedback/sdk', async (original) => ({
  ...(await original<typeof import('@game-feedback/sdk')>()),
  getPost,
  listCategories,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it('attributes the document access check to the authenticated visitor rather than the public cache service', async () => {
  const secret = 'a'.repeat(64);
  vi.stubEnv('GF_PROXY_SECRET', secret);
  const source = new Headers({
    'x-game-feedback-proxy-secret': secret,
    'x-game-feedback-client-ip': '203.0.113.15',
  });
  await expect(documentUnavailable('/ko/posts/post-1', undefined, [], source)).resolves.toBe(false);
  expect(getPost).toHaveBeenCalledExactlyOnceWith(
    'post-1',
    expect.objectContaining({
      headers: { 'x-game-feedback-proxy-secret': secret, 'x-game-feedback-client-ip': '203.0.113.15' },
    }),
  );
});
