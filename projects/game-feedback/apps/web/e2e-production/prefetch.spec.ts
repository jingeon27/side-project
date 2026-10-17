import { test, expect } from '@playwright/test';
import { instant } from '@next/playwright';

const origin = 'http://127.0.0.1:3353';

test('a production navigation shows the prefetched guide and keeps the shared header', async ({ page }) => {
  await page.goto('/ko');
  await expect(page.locator('.feed-heading:visible')).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(window, '__navigationDocument', { value: 'kept', configurable: true }),
  );
  await instant(page, async () => {
    await page.locator('.left-sidebar').getByRole('link', { name: '가이드', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/ko/guide');
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '좋은 피드백은 함께 만들어요', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, '__navigationDocument'))).toBe('kept');
  });
});

test('production administrator routes are unavailable in every language even for an administrator', async ({
  page,
  context,
}) => {
  const login = await context.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-test-admin' },
  });
  expect(login.ok(), await login.text()).toBe(true);
  for (const locale of ['ko', 'en', 'ja']) {
    const response = await context.request.get(`/${locale}/admin`);
    expect(response.status()).toBe(404);
    const flight = await context.request.get(`/${locale}/admin`, {
      headers: { RSC: '1', 'Next-Router-Prefetch': '1' },
    });
    expect(flight.status()).toBe(404);
  }
  await page.goto('/ko/settings');
  await expect(page.getByRole('link', { name: '운영 관리', exact: true })).toHaveCount(0);
  await expect(page.locator('.settings-profile:visible')).toBeVisible();
});

test('the static document applies a saved appearance before hydration and keeps public SEO', async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL: origin, colorScheme: 'light' });
  try {
    await context.addCookies([{ name: 'gf_theme', value: 'dark', url: origin }]);
    const page = await context.newPage();
    const response = await page.goto('/ko/posts/sample-post-0');
    expect(response?.ok()).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.detail-card:visible')).toHaveCSS('background-color', 'rgb(28, 27, 26)');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://feedback.example/ko/posts/sample-post-0',
    );
    expect(
      JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}')['@type'],
    ).toBe('DiscussionForumPosting');
  } finally {
    await context.close();
  }
});

test('an uncached post streams beneath the prefetched shell', async ({ page }) => {
  await page.goto('/ko');
  const post = page.locator('.post-title-link:visible').first();
  await expect(post).toBeVisible();
  const href = await post.getAttribute('href');
  const target = new URL(href ?? '', origin).pathname;
  await instant(page, async () => {
    await post.click();
    await page.waitForURL((url) => url.pathname === target);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main').getByText('불러오고 있어요', { exact: true })).toBeVisible();
    await expect(page.locator('.detail-card:visible')).toHaveCount(0);
  });
  await expect(page.locator('.detail-card:visible')).toBeVisible();
});

test('initial documents render public content without JavaScript and inaccessible posts return a private 404', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: origin,
    javaScriptEnabled: false,
    userAgent: 'bingbot',
    colorScheme: 'light',
  });
  try {
    await context.addCookies([{ name: 'gf_theme', value: 'dark', url: origin }]);
    const page = await context.newPage();
    await page.goto('/ja');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.getByRole('banner')).toContainText('Playmate');
    await page.goto('/ko/posts/sample-post-0');
    await expect(page.locator('.detail-card:visible')).toBeVisible();
    await expect(page.locator('.detail-card:visible')).toHaveCSS('background-color', 'rgb(28, 27, 26)');
    await expect(page).toHaveTitle(/ \| 플레이메이트$/);
    const missing = await context.request.get('/ko/posts/missing-post');
    expect(missing.status()).toBe(404);
    await context.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-0' },
    });
    await context.request.post('/api/blocks', {
      headers: { Origin: origin },
      data: { blockedUserId: 'sample-user-3' },
    });
    for (const path of ['/ko/posts/sample-post-3', '/ko/users/sample-user-3']) {
      const response = await context.request.get(path);
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toContain('덱연구소');
    }
  } finally {
    await context.close();
  }
});
