import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { apiFetch } from './http';
import { getPost, listChatMessages } from './index';
import { messagesFixture, postFixture } from './test/fixtures';

function respond(payload: unknown) {
  const fetcher = vi.fn(
    async (_url: RequestInfo | URL, _options?: RequestInit) =>
      new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

describe('generated request paths', () => {
  it('sends an identifier as one path segment and keeps encoded query values in the query', async () => {
    const detail = respond(postFixture());
    await getPost('post_1-A');
    expect(detail.mock.calls[0]?.[0]).toBe('/api/posts/post_1-A');
    const messages = respond(messagesFixture());
    await listChatMessages('room-1', { cursor: 'a/b?c#d' });
    expect(messages.mock.calls[0]?.[0]).toBe('/api/conversations/room-1/messages?cursor=a%2Fb%3Fc%23d');
  });

  it.each(['..', '.', '', 'a/b', 'a?b', 'a#b', 'a\\b', '../admin'])(
    'rejects a path parameter that could change the request target: %j',
    async (id) => {
      const fetcher = respond(postFixture());
      await expect(getPost(id)).rejects.toMatchObject({
        name: 'ApiError',
        errorCode: 'INVALID_REQUEST_PATH',
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed, relative, or protocol-relative paths before the request', async () => {
    const fetcher = respond({ ok: true });
    const schema = z.object({ ok: z.boolean() });
    for (const url of [
      '//evil.example/api/health',
      'api/health',
      '/api/%E0%A4%A',
      '/api//health',
      '/api/%2e%2e/admin',
    ])
      await expect(apiFetch(url, { schema })).rejects.toMatchObject({ errorCode: 'INVALID_REQUEST_PATH' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
