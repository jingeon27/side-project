import { appRoutes } from '@game-feedback/bridge';

import { expect, test } from './support/fixtures';
import { ORIGIN } from './support/native-host';

test('mobile header and four tabs navigate in place and report their paths to the native shell', async ({
  page,
  nativeHost,
}) => {
  await page.goto('/ko');
  await expect.poll(nativeHost.isReady).toBe(true);
  const tabs = page.getByRole('navigation', { name: '모바일 메뉴' });
  await expect(tabs.getByRole('link')).toHaveText(['홈', '가이드', '채팅', '프로필']);
  await page.evaluate(() =>
    Object.defineProperty(window, '__routeDocument', { value: 'kept', configurable: true }),
  );
  const length = await page.evaluate(() => history.length);
  for (const [name, path] of [
    ['가이드', '/ko/guide'],
    ['채팅', '/ko/messages'],
    ['프로필', '/ko/settings'],
  ]) {
    await tabs.getByRole('link', { name, exact: true }).click();
    await expect.poll(nativeHost.currentPath).toBe(path);
    await expect(tabs.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  const header = page.getByRole('banner');
  await expect(header.locator('.header-actions').getByRole('link')).toHaveCount(1);
  await header.getByRole('combobox', { name: '언어 설정', exact: true }).click();
  await expect(page.getByRole('listbox')).toBeVisible();
  const beforeDropdownBack = await nativeHost.currentPath();
  expect(await nativeHost.requestBack()).toBe(true);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  expect(await nativeHost.currentPath()).toBe(beforeDropdownBack);
  await header.getByRole('combobox', { name: '언어 설정', exact: true }).click();
  await page.getByRole('option', { name: '한국어', exact: true }).click();
  await expect(page).toHaveURL(/\/ko\/settings$/);
  await expect(header.getByRole('combobox')).toContainText('한국어');
  await header.getByRole('link', { name: '알림 0개', exact: true }).click();
  await expect.poll(nativeHost.currentPath).toBe('/ko/notifications');
  await tabs.getByRole('link', { name: '프로필', exact: true }).click();
  await expect.poll(nativeHost.currentPath).toBe('/ko/settings');
  await tabs.getByRole('link', { name: '홈', exact: true }).click();
  await expect.poll(nativeHost.currentPath).toBe('/ko');
  expect(await page.evaluate(() => Reflect.get(window, '__routeDocument'))).toBe('kept');
  expect(await page.evaluate(() => history.length)).toBe(length);
  expect(await nativeHost.requestBack()).toBe(true);
  expect(nativeHost.rootBacks()).toBe(1);
});

test('category chips navigate directly and native back restores the saved filtered feed', async ({
  page,
  nativeHost,
}) => {
  await page.setViewportSize({ width: 400, height: 844 });
  await page.goto('/ko?q=%ED%98%B8%EA%B7%B8&tab=unanswered');
  await expect.poll(nativeHost.isReady).toBe(true);
  const chips = page.locator('.game-board-chips');
  await expect(chips.getByRole('link')).toHaveCount(6);
  await expect.poll(nativeHost.hasOverlay).toBe(false);
  const length = await page.evaluate(() => history.length);
  await chips.getByRole('link', { name: '자유게시판', exact: true }).click();
  await expect.poll(nativeHost.currentPath).toBe('/ko/boards/free');
  const current = chips.locator('[aria-current="page"]');
  await expect(current).toHaveAttribute('href', '/ko/boards/free');
  await expect(current).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(nativeHost.hasOverlay).toBe(false);
  expect(await page.evaluate(() => history.length)).toBe(length);
  expect(await nativeHost.requestBack()).toBe(true);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/ko' &&
      url.searchParams.get('q') === '호그' &&
      url.searchParams.get('tab') === 'unanswered',
  );
  expect(nativeHost.rootBacks()).toBe(0);
  await chips.getByRole('link', { name: '친추판매', exact: true }).click();
  await expect.poll(nativeHost.currentPath).toBe('/ko/boards/friend-sale');
  await chips.getByRole('link', { name: '전체', exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/ko' &&
      url.searchParams.get('q') === '호그' &&
      url.searchParams.get('tab') === 'unanswered',
  );
  await expect(page.getByRole('button', { name: '답변 대기', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('guide shortcuts return from child screens with native back and switch root tabs like the menu', async ({
  page,
  nativeHost,
}) => {
  await page.goto('/ko/guide');
  await expect.poll(nativeHost.isReady).toBe(true);
  const guide = page.getByRole('article');
  const shortcut = (title: string) =>
    guide.getByRole('heading', { name: title, exact: true }).getByRole('link');
  // 게시판·문의는 가이드를 상위로 두고 열려 앱의 뒤로 가기가 가이드로 돌아온다.
  for (const [title, path] of [
    ['전투 모집', '/ko/boards/friendly'],
    ['문의와 신고', '/ko/contact'],
  ] as const) {
    await shortcut(title).click();
    await expect.poll(nativeHost.currentPath).toBe(path);
    expect(await nativeHost.requestBack()).toBe(true);
    await expect.poll(nativeHost.currentPath).toBe('/ko/guide');
  }
  await guide.getByRole('term').getByRole('link', { name: '자유게시판', exact: true }).click();
  await expect.poll(nativeHost.currentPath).toBe('/ko/boards/free');
  expect(await nativeHost.requestBack()).toBe(true);
  await expect.poll(nativeHost.currentPath).toBe('/ko/guide');
  expect(nativeHost.rootBacks()).toBe(0);
  // 채팅은 루트 탭이라 하단 메뉴처럼 가이드 기록을 바꾼다. 뒤로 가기는 홈, 홈에서는 앱 종료다.
  const length = await page.evaluate(() => history.length);
  await shortcut('채팅과 대화내역').click();
  await expect.poll(nativeHost.currentPath).toBe('/ko/messages');
  expect(await page.evaluate(() => history.length)).toBe(length);
  expect(await nativeHost.requestBack()).toBe(true);
  await expect.poll(nativeHost.currentPath).toBe('/ko');
  expect(await nativeHost.requestBack()).toBe(true);
  expect(nativeHost.rootBacks()).toBe(1);
});

test('management routes are unavailable in the public web and native route parser', async ({
  page,
  nativeHost,
}) => {
  await page.goto('/ko/settings');
  await expect.poll(nativeHost.currentPath).toBe('/ko/settings');
  expect((await page.request.get('/ko/admin')).status()).toBe(404);
  await expect(page.getByRole('link', { name: '운영 관리', exact: true })).toHaveCount(0);
});

test('cold detail back uses the parent and reports root exit without replaying tab history', async ({
  page,
  nativeHost,
}) => {
  await page.goto('/ko/posts/sample-post-0');
  await expect.poll(nativeHost.currentPath).toBe('/ko/posts/sample-post-0');
  expect(await nativeHost.requestBack()).toBe(true);
  await expect(page).toHaveURL(/\/ko\/boards\/feedback$/);
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
  await page.getByRole('button', { name: '답변 대기' }).click();
  await expect.poll(nativeHost.currentPath).toBe(appRoutes.feed('ko', { q: '호그', tab: 'unanswered' }));
  await page.evaluate(() =>
    Object.defineProperty(window, '__routeDocument', { value: 'kept', configurable: true }),
  );
  expect(nativeHost.openDeepLink('gamefeedback://ko/messages?conversation=sample-conversation-0-3')).toBe(
    true,
  );
  await expect(page).toHaveURL(/\/ko\/messages\/sample-conversation-0-3$/);
  await expect.poll(nativeHost.currentPath).toBe('/ko/messages/sample-conversation-0-3');
  const length = await page.evaluate(() => history.length);
  expect(nativeHost.openDeepLink('gamefeedback://ko/messages/sample-conversation-0-3')).toBe(true);
  expect(await page.evaluate(() => Reflect.get(window, '__routeDocument'))).toBe('kept');
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
  await page.evaluate(() =>
    Object.defineProperty(window, '__routeDocument', { value: 'kept', configurable: true }),
  );
  const board = appRoutes.boards('ko', 'coaching', undefined, slug);
  expect(nativeHost.openDeepLink(`gamefeedback:/${board}`)).toBe(true);
  await expect.poll(nativeHost.currentPath).toBe(board);
  const chips = page.locator('.game-board-chips');
  await expect(chips.locator('[aria-current="page"]')).toHaveAttribute('href', board);
  await expect(chips.locator('[aria-current="page"]')).toBeInViewport({ ratio: 1 });
  const general = chips.getByRole('link', { name: '자유게시판', exact: true });
  await expect(general).toHaveAttribute('href', appRoutes.boards('ko', 'free', undefined, slug));
  await general.click();
  await expect.poll(nativeHost.currentPath).toBe(appRoutes.boards('ko', 'free', undefined, slug));
  await expect(general).toHaveAttribute('aria-current', 'page');
  await expect.poll(nativeHost.hasOverlay).toBe(false);
  await chips.getByRole('link', { name: '게임코치', exact: true }).click();
  await expect.poll(nativeHost.currentPath).toBe(board);
  const detail = appRoutes.post('ko', post.id, 'COACHING', slug);
  expect(nativeHost.openDeepLink(`gamefeedback:/${detail}`)).toBe(true);
  await expect(page.locator('.coaching-summary:visible')).toContainText('코치 구함');
  await expect(page.locator('.coaching-summary:visible')).toContainText('30,000');
  await expect.poll(nativeHost.currentPath).toBe(detail);
  expect(await nativeHost.requestBack()).toBe(true);
  await expect.poll(nativeHost.currentPath).toBe(board);
  expect(nativeHost.openDeepLink(`gamefeedback:/${appRoutes.boards('ko', 'free', undefined, slug)}`)).toBe(
    true,
  );
  await expect(page.getByRole('heading', { name: '자유게시판', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__routeDocument'))).toBe('kept');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('native back leaves the full-page editor without a dialog and restores filtered feed context', async ({
  page,
  nativeHost,
}) => {
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: ORIGIN },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko?q=hog&tab=unanswered');
  await expect.poll(nativeHost.isReady).toBe(true);
  await page.locator('.feed-heading').getByRole('button', { name: '글쓰기', exact: true }).click();
  await expect.poll(nativeHost.currentPath).toBe('/ko/write');
  await expect(page.getByRole('form', { name: '글쓰기', exact: true })).toBeVisible();
  await expect(page.getByRole('banner')).toBeHidden();
  await expect.poll(nativeHost.hasOverlay).toBe(false);
  expect(await nativeHost.requestBack()).toBe(true);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/ko' &&
      url.searchParams.get('q') === 'hog' &&
      url.searchParams.get('tab') === 'unanswered',
  );
  const path = appRoutes.compose('ko', 'FRIENDLY');
  expect(nativeHost.openDeepLink(`gamefeedback:/${path}`)).toBe(true);
  await expect.poll(nativeHost.currentPath).toBe(path);
  await expect(page.getByLabel('분류', { exact: true })).toHaveValue('FRIENDLY');
  expect(await nativeHost.requestBack()).toBe(true);
  await expect.poll(nativeHost.currentPath).toBe(appRoutes.feed('ko', { q: 'hog', tab: 'unanswered' }));
  await page.goto(path);
  await expect.poll(nativeHost.currentPath).toBe(path);
  await expect(page.getByLabel('분류', { exact: true })).toHaveValue('FRIENDLY');
  expect(await nativeHost.requestBack()).toBe(true);
  await expect.poll(nativeHost.currentPath).toBe('/ko/boards/friendly');
});

test('native search keeps the coaching role and returns to the filtered classification', async ({
  page,
  nativeHost,
}) => {
  const board = appRoutes.boards('ko', 'coaching', undefined, undefined, { coachingRole: 'STUDENT' });
  await page.goto(board);
  await expect.poll(nativeHost.isReady).toBe(true);
  const search = appRoutes.search('ko', { board: 'coaching', coachingRole: 'STUDENT' });
  await page.getByRole('banner').getByRole('link', { name: '검색', exact: true }).click();
  await expect.poll(nativeHost.currentPath).toBe(search);
  await page.getByRole('textbox', { name: '게시판 검색', exact: true }).fill('모집');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect
    .poll(nativeHost.currentPath)
    .toBe(appRoutes.search('ko', { board: 'coaching', coachingRole: 'STUDENT', q: '모집' }));
  expect(await nativeHost.requestBack()).toBe(true);
  await expect
    .poll(nativeHost.currentPath)
    .toBe(appRoutes.boards('ko', 'coaching', '모집', undefined, { coachingRole: 'STUDENT' }));
});

test('native feedback search and back keep its reply status, query and game', async ({
  page,
  nativeHost,
}) => {
  const board = appRoutes.boards('ko', 'feedback', '수비', undefined, { feedbackStatus: 'WAITING' });
  await page.goto(board);
  await expect.poll(nativeHost.isReady).toBe(true);
  const filters = page.getByRole('navigation', { name: '답변 상태', exact: true });
  await expect(filters.getByRole('link', { name: '답변 대기', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('banner').getByRole('link', { name: '검색', exact: true }).click();
  await expect
    .poll(nativeHost.currentPath)
    .toBe(appRoutes.search('ko', { board: 'feedback', q: '수비', feedbackStatus: 'WAITING' }));
  await page.getByRole('textbox', { name: '게시판 검색', exact: true }).fill('공격');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect
    .poll(nativeHost.currentPath)
    .toBe(appRoutes.search('ko', { board: 'feedback', q: '공격', feedbackStatus: 'WAITING' }));
  expect(await nativeHost.requestBack()).toBe(true);
  await expect
    .poll(nativeHost.currentPath)
    .toBe(appRoutes.boards('ko', 'feedback', '공격', undefined, { feedbackStatus: 'WAITING' }));
  await expect(filters.getByRole('link', { name: '답변 대기', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
