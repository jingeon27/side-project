import { afterEach, expect, it, vi } from 'vitest';

import { proxyGraphql } from './graphql-proxy.server';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it('브라우저의 예상 사용자 헤더와 현재 쿠키를 API에 함께 전달하고 계정 불일치 오류를 그대로 반환해야 한다', async () => {
  const error = { errors: [{ message: '세션이 바뀌었습니다.', extensions: { code: 'UNAUTHENTICATED' } }] };
  const fetch = vi.fn(async (_input, options: RequestInit) => {
    const headers = new Headers(options.headers);
    expect(headers.get('X-Expected-Viewer-Id')).toBe('alice');
    expect(headers.get('cookie')).toBe('contest_session=bob-cookie');
    return Response.json(error);
  });
  vi.stubGlobal('fetch', fetch);
  const response = await proxyGraphql(
    new Request('http://web.test/backend/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Expected-Viewer-Id': 'alice',
        cookie: 'contest_session=bob-cookie',
      },
      body: JSON.stringify({ query: 'mutation { createPostComment(postId: "post", body: "draft") { id } }' }),
    }),
  );
  expect(await response.json()).toEqual(error);
  expect(fetch).toHaveBeenCalledOnce();
});
