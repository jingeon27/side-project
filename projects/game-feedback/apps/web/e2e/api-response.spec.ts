import { test, expect } from '@playwright/test';
import type { PostList } from '@game-feedback/contracts';
const postsRoute = /\/api\/posts(?:\?.*)?$/;

test('a suspended feed keeps its filters and shell usable until data arrives', async ({ page }) => {
  const pending = Promise.withResolvers<void>();
  await page.route(postsRoute, async (route) => {
    await pending.promise;
    await route.continue();
  });
  try {
    await page.goto('/ko', { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('게시글 불러오는 중')).toBeVisible();
    await expect(page.getByRole('textbox', { name: '게시글 검색' })).toBeVisible();
    await expect(page.locator('.topbar')).toBeVisible();
    pending.resolve();
    await expect(page.locator('.post-card').first()).toBeVisible();
    await expect(page.getByLabel('게시글 불러오는 중')).not.toBeVisible();
  } finally {
    pending.resolve();
  }
});

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
  const message = page.getByRole('alert', { name: '최신 글 오류' });
  await expect(message).toBeVisible();
  await expect(page.getByRole('textbox', { name: '게시글 검색' })).toBeVisible();
  await expect(page.getByText('첫 번째 이야기를 기다려요', { exact: true })).not.toBeVisible();
  await expect(page.locator('.post-card')).toHaveCount(0);
  malformed = false;
  await message.getByRole('button', { name: '다시 시도하기', exact: true }).click();
  await expect(page.locator('.post-card').first()).toBeVisible();
  await expect(message).not.toBeVisible();
});
