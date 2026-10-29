import { CommentSchema, PostSchema } from '@game-feedback/contracts';

import { expect, test } from './support/test';

test('200개가 넘는 한 스레드의 답글을 마지막까지 중복 없이 읽는다', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const origin = new URL(baseURL ?? 'http://127.0.0.1:3301').origin;
  const headers = { Origin: origin };
  const nickname = `답글페이징_${Date.now().toString(36)}`;
  const login = await page.request.post('/api/auth/demo', { headers, data: { nickname } });
  expect(login.ok()).toBe(true);
  const created = await page.request.post('/api/posts', {
    headers,
    data: {
      title: '답글을 모두 읽을 수 있는 게시글',
      body: '초기 목록 뒤의 답글까지 순서대로 확인해요.',
      board: 'FREE',
      categoryId: 'clash-royale',
    },
  });
  expect(created.ok()).toBe(true);
  const post = PostSchema.parse(await created.json());
  const endpoint = `/api/posts/${post.id}/comments`;
  const rootResponse = await page.request.post(endpoint, { headers, data: { body: '답글의 원댓글' } });
  expect(rootResponse.ok()).toBe(true);
  const root = CommentSchema.parse(await rootResponse.json());
  for (const index of Array.from({ length: 205 }, (_, index) => index + 1)) {
    const response = await page.request.post(endpoint, {
      headers,
      data: { parentId: root.id, body: `이어지는 답글 ${index}` },
    });
    expect(response.ok()).toBe(true);
  }

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(`/ko/posts/${post.id}?board=free`);
  const replies = page.getByRole('list', { name: '답글', exact: true });
  const bubbles = replies.locator('.comment-bubble');
  await expect(bubbles).toHaveCount(6);
  for (const count of [36, 66, 96, 126, 156, 186, 205]) {
    await replies.getByRole('button', { name: '이전 답글 더 보기', exact: true }).click();
    await expect(bubbles).toHaveCount(count);
  }

  await expect(replies.getByRole('button', { name: '이전 답글 더 보기', exact: true })).toHaveCount(0);
  await expect(bubbles).toHaveText(
    Array.from({ length: 205 }, (_, index) => `@${nickname} 이어지는 답글 ${index + 1}`),
  );
  const ids = await replies.locator('article[id]').evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(new Set(ids).size).toBe(205);
  expect(errors).toEqual([]);
});
