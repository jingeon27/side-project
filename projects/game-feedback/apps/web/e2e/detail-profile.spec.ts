import { expect, test } from '@playwright/test';

const origin = 'http://127.0.0.1:3301';
const headers = { Origin: origin };

test('post detail uses a compact game breadcrumb and one contact action with unbroken dates at 393px', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const list = await (await page.request.get('/api/posts?board=FRIEND_SALE&limit=1')).json();
  const post = list.items[0];
  const path = `/ko/posts/${post.id}?board=friend-sale`;
  await page.goto(path);
  const header = page.getByRole('banner');
  await expect(header.getByRole('navigation', { name: '게시글 경로' })).toHaveText('클래시로얄친추판매');
  await expect(header.getByRole('link', { name: '돌아가기', exact: true })).toHaveAttribute(
    'href',
    '/ko/boards/friend-sale',
  );
  await expect(header.getByRole('combobox', { name: '언어 설정', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(header.getByRole('link', { name: '알림 0개', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(header.getByRole('link', { name: '검색', exact: true })).toHaveCount(0);
  await expect(page.locator('.game-board-navigation')).toHaveCount(0);
  await expect(page.locator('.detail-card .chat-author-link')).toHaveCount(1);
  await expect(page.locator('.detail-contact-action')).toHaveCount(1);
  for (const width of [393, 320, 1440]) {
    await page.setViewportSize({ width, height: 852 });
    for (const date of await page.locator('.detail-author-meta time, .post-publication time').all()) {
      expect(await date.evaluate((node) => node.getClientRects().length)).toBe(1);
      expect(await date.evaluate((node) => node.getBoundingClientRect().right <= innerWidth)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `/tmp/gf-detail-final-${width}.png`, fullPage: true });
  }
  await header.getByRole('link', { name: '돌아가기', exact: true }).click();
  await expect(page).toHaveURL('/ko/boards/friend-sale');
  await expect(header.locator('.mobile-page-title')).toHaveText('홈');
  const crawler = await browser.newContext({
    baseURL: origin,
    javaScriptEnabled: false,
    viewport: { width: 393, height: 852 },
  });
  try {
    const reader = await crawler.newPage();
    expect((await reader.goto(`/ko/posts/${post.id}`))?.status()).toBe(200);
    await expect(reader.getByRole('navigation', { name: '게시글 경로' })).toHaveText('클래시로얄친추판매');
    await expect(reader.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://feedback.example/ko/posts/${post.id}`,
    );
  } finally {
    await crawler.close();
  }
});

test('profile shows only the signed-in user’s posts and keeps every classification readable', async ({
  page,
}) => {
  const title = `내 프로필 작성글 ${Date.now().toString(36)}`;
  await page.request.post('/api/auth/test-login', { headers, data: { accountId: 'sample-user-0' } });
  const categories = await (await page.request.get('/api/categories')).json();
  expect(
    (
      await page.request.post('/api/posts', {
        headers,
        data: {
          title,
          body: '프로필에서 내 자유게시판 글을 확인해요.',
          board: 'FREE',
          categoryId: categories[0].id,
        },
      })
    ).ok(),
  ).toBe(true);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/ko/settings');
  const posts = page.getByRole('region', { name: '내가 작성한 글', exact: true });
  await expect(posts.getByRole('heading', { name: '내가 작성한 글', exact: true })).toBeVisible();
  await expect(posts.locator('.post-list')).toContainText(title);
  await expect(posts.locator('.post-card .post-author strong')).toHaveText(
    Array(await posts.locator('.post-card').count()).fill('새벽의호그'),
  );
  await posts
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    .click();
  await expect(page.getByRole('navigation', { name: '게시글 경로' })).toContainText('자유게시판');
  await page.request.post('/api/auth/test-login', { headers, data: { accountId: 'sample-user-3' } });
  await page.goto('/ko/settings');
  await expect(posts.locator('.post-card').first()).toBeVisible();
  await expect(posts).not.toContainText(title);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('chat keeps report visible, moves destructive actions into its menu, and links the peer from header and avatar', async ({
  page,
}) => {
  await page.request.post('/api/auth/test-login', { headers, data: { accountId: 'sample-user-0' } });
  await page.setViewportSize({ width: 393, height: 852 });
  const path = '/ko/messages/sample-conversation-0-3';
  await page.goto(path);
  const header = page.locator('.conversation-heading:visible');
  const report = header.getByRole('button', { name: '사용자 신고', exact: true });
  const menu = header.getByRole('button', { name: '대화 메뉴', exact: true });
  await expect(report).toBeInViewport({ ratio: 1 });
  await expect(menu).toBeInViewport({ ratio: 1 });
  expect((await header.boundingBox())?.height).toBeLessThanOrEqual(68);
  await expect(header.getByRole('button', { name: '대화내역 삭제', exact: true })).toHaveCount(0);
  await menu.click();
  await expect(page.getByRole('menuitem')).toHaveText(['대화내역 삭제', '차단']);
  await page.keyboard.press('Escape');
  await header.getByRole('link', { name: '덱연구소 프로필 보기', exact: true }).click();
  await expect(page).toHaveURL('/ko/users/sample-user-3');
  await expect(page.getByRole('heading', { name: '덱연구소', exact: true })).toBeVisible();
  await page.goBack();
  const avatar = page.locator('.chat-peer-avatar:visible').first();
  await expect(avatar).toHaveAttribute('href', '/ko/users/sample-user-3');
  await avatar.click();
  await expect(page).toHaveURL('/ko/users/sample-user-3');
  await page.goBack();
  await expect(report).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: '/tmp/gf-chat-header-393.png', fullPage: true });
});

test('changing a tag discards an in-flight profile preview and saves only the newly confirmed tag', async ({
  page,
}) => {
  await page.request.post('/api/auth/demo', {
    headers,
    data: { nickname: `태그검증_${Date.now().toString(36)}` },
  });
  const responseReady = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route('**/api/game-profiles/**', async (route) => {
    const response = await route.fetch();
    if (decodeURIComponent(new URL(route.request().url()).pathname).endsWith('#GG829JGY')) {
      responseReady.resolve();
      await release.promise;
    }
    await route.fulfill({ response });
  });
  await page.goto('/ko/settings');
  await page.getByRole('button', { name: '계정 등록', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('textbox', { name: '플레이어 태그', exact: true }).fill('#GG829JGY');
  await sheet.getByRole('button', { name: '조회', exact: true }).click();
  await responseReady.promise;
  await sheet.getByRole('textbox', { name: '플레이어 태그', exact: true }).fill('#P0LYQ829');
  const firstResponse = page.waitForResponse((response) =>
    decodeURIComponent(response.url()).endsWith('#GG829JGY'),
  );
  release.resolve();
  await firstResponse;
  await expect(sheet.getByRole('button', { name: '내 계정에 등록', exact: true })).toHaveCount(0);
  await sheet.getByRole('button', { name: '조회', exact: true }).click();
  await expect(sheet.locator('.profile-preview')).toContainText('#P0LYQ829');
  await sheet.getByRole('button', { name: '내 계정에 등록', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  const accounts = await (await page.request.get('/api/me/game-accounts')).json();
  expect(accounts.some((account: { playerTag: string }) => account.playerTag === '#P0LYQ829')).toBe(true);
});
