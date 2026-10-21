import { expect, test, type APIRequestContext } from '@playwright/test';
import { PostSchema, AnswerSchema, CommentSchema } from '@game-feedback/contracts';

const origin = 'http://127.0.0.1:3301';
const headers = { Origin: origin };
async function account(request: APIRequestContext, accountId: string) {
  expect((await request.post('/api/auth/test-token', { headers, data: { accountId } })).ok()).toBe(true);
}
async function post(request: APIRequestContext) {
  const response = await request.post('/api/posts', {
    headers,
    data: {
      categoryId: 'clash-royale',
      title: '캐시를 먼저 채운 공개 글',
      body: 'NestJS 변경이 첫 공개 HTML부터 반영됩니다.',
    },
  });
  expect(response.ok()).toBe(true);
  return PostSchema.parse(await response.json());
}

test('NestJS mutations expire primed public HTML without a browser Server Action', async ({
  page,
  browser,
}) => {
  await account(page.request, 'sample-user-0');
  const created = await post(page.request);
  const guest = await browser.newContext({ baseURL: origin, javaScriptEnabled: false });
  try {
    const reader = await guest.newPage();
    await reader.goto(`/ko/posts/${created.id}`);
    await expect(reader.getByRole('heading', { name: created.title, exact: true })).toBeVisible();
    expect(
      (
        await page.request.patch(`/api/posts/${created.id}`, {
          headers,
          data: {
            title: 'NestJS에서 바꾼 최신 제목',
            body: '만료된 본문을 먼저 보내지 않고 바로 갱신합니다.',
          },
        })
      ).ok(),
    ).toBe(true);
    await reader.reload();
    await expect(
      reader.getByRole('heading', { name: 'NestJS에서 바꾼 최신 제목', exact: true }),
    ).toBeVisible();
    await expect(
      reader.getByText('만료된 본문을 먼저 보내지 않고 바로 갱신합니다.', { exact: true }),
    ).toBeVisible();

    const response = await page.request.post(`/api/posts/${created.id}/comments`, {
      headers,
      data: { body: 'API에서 등록한 새 댓글' },
    });
    expect(response.ok()).toBe(true);
    const comment = CommentSchema.parse(await response.json());
    await reader.reload();
    await expect(reader.locator('.comment-bubble')).toHaveText('API에서 등록한 새 댓글');
    expect(
      (
        await page.request.patch(`/api/comments/${comment.id}`, {
          headers,
          data: { body: 'API에서 수정한 댓글' },
        })
      ).ok(),
    ).toBe(true);
    await reader.reload();
    await expect(reader.locator('.comment-bubble')).toHaveText('API에서 수정한 댓글');
    expect((await page.request.delete(`/api/comments/${comment.id}`, { headers })).ok()).toBe(true);
    await reader.reload();
    await expect(reader.locator('.comment-bubble')).toHaveCount(0);
  } finally {
    await guest.close();
  }
});

test('administrator answer visibility changes invalidate an already cached public detail', async ({
  page,
  browser,
}) => {
  await account(page.request, 'sample-user-0');
  const created = await post(page.request);
  await account(page.request, 'sample-user-3');
  const response = await page.request.post(`/api/posts/${created.id}/answers`, {
    headers,
    data: { body: '숨김과 복원을 확인할 충분히 긴 답변입니다.' },
  });
  expect(response.ok()).toBe(true);
  const answer = AnswerSchema.parse(await response.json());
  const guest = await browser.newContext({ baseURL: origin, javaScriptEnabled: false });
  try {
    const reader = await guest.newPage();
    await reader.goto(`/ko/posts/${created.id}`);
    await expect(reader.getByText(answer.body, { exact: true })).toBeVisible();
    await account(page.request, 'sample-test-admin');
    for (const hidden of [true, false]) {
      expect(
        (
          await page.request.post('/api/admin/hide', {
            headers,
            data: { targetType: 'ANSWER', targetId: answer.id, hidden, reason: '실제 캐시 무효화 검증' },
          })
        ).ok(),
      ).toBe(true);
      await reader.reload();
      await expect(reader.getByText(answer.body, { exact: true })).toHaveCount(hidden ? 0 : 1);
    }
  } finally {
    await guest.close();
  }
});

test('the revalidation route rejects browser requests without the server credential', async ({ request }) => {
  const response = await request.post('/_internal/cache/revalidate', { data: { tags: ['posts'] } });
  expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect((await request.get('/_internal/cache/revalidate')).status()).toBe(405);
});
