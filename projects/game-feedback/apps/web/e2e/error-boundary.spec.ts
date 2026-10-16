import { test, expect, type Page } from '@playwright/test';
import type { ChatMessageList, PostDetail } from '@game-feedback/contracts';

const origin = 'http://127.0.0.1:3301';
const marker = '2001-02-03T04:05:06.000Z';

async function injectDateRenderFailure(page: Page) {
  // The browser owns fault injection; the application has no test-only crash switch.
  await page.addInitScript((timestamp) => {
    const original = Date.prototype.toLocaleDateString;
    Date.prototype.toLocaleDateString = function (
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ) {
      if (
        this.getTime() === new Date(timestamp).getTime() &&
        sessionStorage.getItem('date-render-fault') !== 'off'
      ) {
        throw new Error('Injected date render failure');
      }
      return original.call(this, locales, options);
    };
  }, marker);
}

test('a comment render failure preserves the post and answers and recovers within its own boundary', async ({
  page,
}) => {
  await injectDateRenderFailure(page);
  await page.route('**/api/posts/sample-post-0', async (route) => {
    const response = await route.fetch();
    const detail = (await response.json()) as PostDetail;
    await route.fulfill({
      response,
      json: { ...detail, comments: detail.comments.map((comment) => ({ ...comment, createdAt: marker })) },
    });
  });
  await page.goto('/ko/posts/sample-post-0');
  const failure = page.getByRole('alert', { name: '댓글 오류' });
  await expect(failure).toBeVisible();
  await expect(page.locator('.detail-card')).toBeVisible();
  await expect(page.locator('.answer-card').first()).toBeVisible();
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.getByRole('alert', { name: '이 화면 오류' })).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem('date-render-fault', 'off'));
  await failure.getByRole('button', { name: '다시 시도하기' }).click();
  await expect(page.locator('article.comment').first()).toBeVisible();
  await expect(failure).toHaveCount(0);
});

test('a chat render failure keeps the inbox usable and recovers without reloading the service', async ({
  page,
}) => {
  await injectDateRenderFailure(page);
  const login = await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  await page.route('**/api/conversations/sample-conversation-0-3/messages*', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const payload = (await response.json()) as ChatMessageList;
    await route.fulfill({
      response,
      json: {
        ...payload,
        items: payload.items.map((message) => ({ ...message, createdAt: marker })),
      },
    });
  });
  await page.goto('/ko/messages?conversation=sample-conversation-0-3');
  const failure = page.getByRole('alert', { name: '대화창 오류' });
  await expect(failure).toBeVisible();
  await expect(page.getByRole('complementary', { name: '내 대화 목록' })).toBeVisible();
  await expect(page.locator('.conversation-row').first()).toBeVisible();
  await expect(page.locator('.shell-player-sidebar')).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(failure).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('alert', { name: '이 화면 오류' })).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem('date-render-fault', 'off'));
  await failure.getByRole('button', { name: '다시 시도하기' }).click();
  await expect(page.getByRole('log', { name: '대화 메시지' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '메시지 내용' })).toBeVisible();
  await expect(failure).toHaveCount(0);
});
