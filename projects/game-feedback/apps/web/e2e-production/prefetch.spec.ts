import { test, expect } from '@playwright/test';
import { instant } from '@next/playwright';

const origin = 'http://127.0.0.1:3353';

for (const [slug, title] of [
  ['feedback', '피드백'],
  ['friend-sale', '친추판매'],
  ['friendly', '전투 모집'],
  ['coaching', '게임코치'],
  ['free', '자유게시판'],
] as const) {
  test(`the ${slug} board prefetches its title, search and write controls with list skeletons`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 400, height: 900 });
    await page.goto('/ko');
    const link = page.locator('.game-board-chips').getByRole('link', { name: title, exact: true });
    await expect(link).toBeVisible();
    await link.scrollIntoViewIfNeeded();
    await instant(page, async () => {
      await link.click();
      await page.waitForURL((url) => url.pathname === `/ko/boards/${slug}`);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(page.getByRole('banner').getByRole('link', { name: '검색', exact: true })).toBeEnabled();
      await expect(
        page.getByRole('button', { name: slug === 'coaching' ? '코칭 등록' : '글쓰기', exact: true }),
      ).toBeEnabled();
      await expect(page.getByRole('status', { name: '게시글 불러오는 중' })).toBeVisible();
    });
    await expect(page.locator('.board-post-list:visible .post-card').first()).toBeVisible();
  });
}

for (const width of [400, 1440]) {
  test(`the prefetched feed keeps its title and controls while only the list loads at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ko/guide');
    try {
      await instant(page, async () => {
        const navigation = width === 400 ? page.locator('.mobile-nav') : page.locator('.left-sidebar');
        await navigation.getByRole('link', { name: '홈', exact: true }).click();
        await page.waitForURL((url) => url.pathname === '/ko');
        await expect(page.getByRole('heading', { name: '홈', exact: true })).toBeVisible();
        await expect(page.getByRole('banner').getByRole('link', { name: '검색', exact: true })).toBeEnabled();
        await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toBeEnabled();
        await expect(page.getByRole('status', { name: '게시글 불러오는 중' })).toBeVisible();
        await expect(page.locator('.post-list-skeleton:visible .skeleton-card')).toHaveCount(3);
        await expect(page.locator('.post-card:visible')).toHaveCount(0);
        await page
          .getByRole('banner')
          .getByRole('link', { name: '검색', exact: true })
          .evaluate((node) => node.setAttribute('data-shell-persistence', 'kept'));
      });
      const search = page.getByRole('banner').getByRole('link', { name: '검색', exact: true });
      const heading = await page.locator('.feed-heading:visible').boundingBox();
      await expect(page.locator('.post-card:visible').first()).toBeVisible();
      await expect(search).toHaveAttribute('data-shell-persistence', 'kept');
      const loadedHeading = await page.locator('.feed-heading:visible').boundingBox();
      expect(loadedHeading?.y).toBe(heading?.y);
      expect(loadedHeading?.height).toBe(heading?.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await page.close();
    }
  });
}

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
    await expect(page.getByRole('heading', { name: '이용 가이드', exact: true })).toBeVisible();
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
    await expect(page.locator('.post-card').first()).toBeVisible();
    for (const slug of ['feedback', 'friend-sale', 'friendly', 'coaching', 'free']) {
      const response = await page.goto(`/ko/boards/${slug}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('.board-post-list .post-card').first()).toBeVisible();
    }
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
