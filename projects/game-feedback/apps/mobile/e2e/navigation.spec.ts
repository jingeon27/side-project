import { test, expect } from './support/fixtures';
import { ORIGIN } from './support/native-host';
import { appRoutes } from '@game-feedback/bridge';

test('an admin deep link opens the protected management page and native back returns to account settings', async ({
  page,
  nativeHost,
}) => {
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: ORIGIN },
    data: { accountId: 'sample-test-admin' },
  });
  await page.goto('/ko/admin');
  await expect(page.getByRole('heading', { name: '운영 관리', exact: true })).toBeVisible();
  await expect.poll(nativeHost.currentPath).toBe('/ko/admin');
  expect(await nativeHost.requestBack()).toBe(true);
  await expect.poll(nativeHost.currentPath).toBe('/ko/settings');
  await expect(page.getByRole('link', { name: '운영 관리', exact: true })).toBeVisible();
});

test('cold detail back uses the parent and reports root exit without replaying tab history', async ({
  page,
  nativeHost,
}) => {
  await page.goto('/ko/posts/sample-post-0');
  await expect.poll(nativeHost.currentPath).toBe('/ko/posts/sample-post-0');
  expect(await nativeHost.requestBack()).toBe(true);
  await expect(page).toHaveURL(/\/ko$/);
  expect(await nativeHost.requestBack()).toBe(true);
  expect(nativeHost.rootBacks()).toBe(1);
});

test('query locations, warm nested links and duplicate opens preserve the current document', async ({
  page,
  nativeHost,
}) => {
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: ORIGIN },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko?q=%ED%98%B8%EA%B7%B8');
  await expect.poll(nativeHost.currentPath).toBe(appRoutes.feed('ko', { q: '호그' }));
  await page.getByRole('tab', { name: '답변을 기다려요' }).click();
  await expect.poll(nativeHost.currentPath).toBe(appRoutes.feed('ko', { q: '호그', tab: 'unanswered' }));
  await page.evaluate(() => document.documentElement.setAttribute('data-route-document', 'kept'));
  expect(nativeHost.openDeepLink('gamefeedback://ko/messages?conversation=sample-conversation-0-3')).toBe(
    true,
  );
  await expect(page).toHaveURL(/\/ko\/messages\/sample-conversation-0-3$/);
  await expect.poll(nativeHost.currentPath).toBe('/ko/messages/sample-conversation-0-3');
  const length = await page.evaluate(() => history.length);
  expect(nativeHost.openDeepLink('gamefeedback://ko/messages/sample-conversation-0-3')).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-route-document', 'kept');
  expect(await page.evaluate(() => history.length)).toBe(length);
  expect(await nativeHost.requestBack()).toBe(true);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/ko' &&
      url.searchParams.get('tab') === 'unanswered' &&
      url.searchParams.get('q') === '호그',
  );
});

test('coaching and general-board deep links preserve the game and return to its board', async ({
  page,
  nativeHost,
}) => {
  const slug = `native-game-${Date.now().toString(36)}`;
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: ORIGIN },
    data: { accountId: 'sample-test-admin' },
  });
  const categoryResponse = await page.request.post('/api/admin/categories', {
    headers: { Origin: ORIGIN },
    data: { slug, name: '네이티브 테스트 게임' },
  });
  expect(categoryResponse.ok()).toBe(true);
  const category = await categoryResponse.json();
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: ORIGIN },
    data: { accountId: 'sample-user-0' },
  });
  const created = await page.request.post('/api/posts', {
    headers: { Origin: ORIGIN },
    data: {
      categoryId: category.id,
      board: 'COACHING',
      title: '기본 운영을 알려줄 코치를 구해요',
      body: '운영을 차근차근 알려주실 코치를 구해요. 유료 레슨의 일정은 채팅으로 상담해요.',
      coaching: { role: 'STUDENT', pricing: { type: 'HOURLY', amount: 30000 } },
    },
  });
  expect(created.ok()).toBe(true);
  const post = await created.json();
  await page.goto('/ko');
  await expect.poll(nativeHost.isReady).toBe(true);
  await page.evaluate(() => document.documentElement.setAttribute('data-route-document', 'kept'));
  const board = appRoutes.boards('ko', 'coaching', undefined, slug);
  expect(nativeHost.openDeepLink(`gamefeedback:/${board}`)).toBe(true);
  await expect.poll(nativeHost.currentPath).toBe(board);
  const detail = appRoutes.post('ko', post.id, 'COACHING', slug);
  expect(nativeHost.openDeepLink(`gamefeedback:/${detail}`)).toBe(true);
  await expect(page.locator('.coaching-summary')).toContainText('코치 구함');
  await expect(page.locator('.coaching-summary')).toContainText('30,000');
  await expect.poll(nativeHost.currentPath).toBe(detail);
  expect(await nativeHost.requestBack()).toBe(true);
  await expect.poll(nativeHost.currentPath).toBe(board);
  expect(nativeHost.openDeepLink(`gamefeedback:/${appRoutes.boards('ko', 'free', undefined, slug)}`)).toBe(
    true,
  );
  await expect(page.getByRole('heading', { name: '자유게시판', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-route-document', 'kept');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
