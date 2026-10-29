import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiResponseValidationError, getPost, listPostAnswers } from './index';
import { postFixture } from './test/fixtures';

function respond(payload: unknown) {
  const fetcher = vi.fn(
    async (_url: RequestInfo | URL, _options?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

describe('answer page response validation', () => {
  it('pages later answers by cursor and rejects a detail without the answer cursor', async () => {
    const [answer] = postFixture().answers;
    const page = { items: [answer], nextCursor: 'next-answers' };
    const fetcher = respond(page);
    expect(await listPostAnswers('post-1', { cursor: 'cursor-1', limit: 30 })).toEqual(page);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/posts/post-1/answers?cursor=cursor-1&limit=30');
    respond({ ...page, nextCursor: '' });
    await expect(listPostAnswers('post-1', { cursor: 'cursor-1' })).rejects.toBeInstanceOf(
      ApiResponseValidationError,
    );
    respond({ ...postFixture(), answersCursor: 'more-answers' });
    expect((await getPost('post-1')).answersCursor).toBe('more-answers');
    const withoutCursor: Record<string, unknown> = { ...postFixture() };
    delete withoutCursor.answersCursor;
    respond(withoutCursor);
    await expect(getPost('post-1')).rejects.toBeInstanceOf(ApiResponseValidationError);
  });
});
