import { test, expect } from '@playwright/test';
import type { PostList } from '@game-feedback/contracts';
const postsRoute = /\/api\/posts(?:\?.*)?$/;

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});

test('malformed display fields use safe fallbacks before a feed card is rendered', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(postsRoute, async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as PostList;
    await route.fulfill({
      response,
      json: {
        ...payload,
        items: payload.items.map((post, index) =>
          index === 0
            ? {
                ...post,
                answerCount: 'unexpected-count',
                helpfulCount: -1,
                author: {
                  ...post.author,
                  nickname: { unexpected: true },
                  isVerified: 'false',
                  supercellTag: 42,
                },
              }
            : post,
        ),
      },
    });
  });
  await page.goto('/ko');
  const card = page.locator('.post-card').first();
  await expect(card.getByText('알 수 없는 플레이어', { exact: true })).toBeVisible();
  await expect(card.locator('.answer-count strong')).toHaveText('0');
  await expect(card.getByText('인증 유저 (테스트)', { exact: true })).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('an invalid list shows a response error and recovers on retry without pretending it is empty', async ({
  page,
}) => {
  let malformed = true;
  await page.route(postsRoute, async (route) => {
    if (!malformed) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { items: null, nextCursor: null },
    });
  });
  await page.goto('/ko');
  const message = page.getByText('서버 응답을 확인하지 못했어요. 새로고침 후 내용을 확인해 주세요.', {
    exact: true,
  });
  await expect(message).toBeVisible();
  await expect(page.getByText('첫 번째 이야기를 기다려요', { exact: true })).not.toBeVisible();
  await expect(page.locator('.post-card')).toHaveCount(0);
  malformed = false;
  await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await expect(page.locator('.post-card').first()).toBeVisible();
  await expect(message).not.toBeVisible();
});
