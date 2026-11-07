import { instant } from '@next/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';

const origin = 'http://127.0.0.1:3353';

function trackPrefetches({ page, contentOnly = false }: { page: Page; contentOnly?: boolean }) {
  const completed = new Set<string>();
  const successful = new WeakSet<Request>();
  page.on('response', (response) => {
    if (response.ok()) successful.add(response.request());
  });
  const handleComplete = (request: Request) => {
    const headers = request.headers();
    if (!headers['next-router-prefetch'] && !headers['next-router-segment-prefetch']) return;
    if (contentOnly && headers['next-router-segment-prefetch'] === '/_tree') return;
    const failure = request.failure();
    if (failure && failure.errorText !== 'net::ERR_ABORTED') return;
    if (!successful.has(request)) return;
    completed.add(new URL(request.url()).pathname);
  };
  page.on('requestfinished', handleComplete);
  // Next는 셸을 필요한 바이트만 읽고 reader.cancel()할 수 있다. 이때 Response.finished()는 완료되지 않는다.
  page.on('requestfailed', handleComplete);
  return async (path: string) => expect.poll(() => completed.has(path)).toBe(true);
}

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
      await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toBeEnabled();
      await expect(page.getByRole('status', { name: '게시글 불러오는 중' })).toBeVisible();
      if (slug === 'feedback') {
        const filters = page.getByRole('navigation', { name: '답변 상태', exact: true });
        await expect(filters.getByRole('link')).toHaveText(['전체', '답변 대기', '답변 있음']);
        await expect(filters.getByRole('link', { name: '답변 대기', exact: true })).toBeEnabled();
      }
    });
    await expect(page.locator('.board-post-list:visible .post-card').first()).toBeVisible();
  });
}

for (const width of [400, 1440]) {
  test(`board-to-board and feed navigation updates the selected tab before list data at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const waitForPrefetch = trackPrefetches({ page });
    await page.goto('/ko/boards/friendly?battleMode=DUEL');
    await expect(page.locator('.board-post-list:visible .post-card').first()).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: '전투 유형' }).getByRole('link', { name: '1:1' }),
    ).toHaveAttribute('aria-current', 'page');
    const historyLength = await page.evaluate(() => history.length);
    const navigation =
      width === 400 ? page.locator('.game-board-chips:visible') : page.locator('.left-sidebar:visible');

    for (const [path, title, linkName] of [
      ['/ko/boards/free', '자유게시판', '자유게시판'],
      ['/ko/boards/feedback', '피드백', '피드백'],
      ['/ko', '전체', width === 400 ? '전체' : '홈'],
    ] as const) {
      const destination = navigation.getByRole('link', { name: linkName, exact: true });
      await destination.scrollIntoViewIfNeeded();
      await destination.hover();
      await waitForPrefetch(path);
      await instant(page, async () => {
        await destination.click();
        await page.waitForURL((url) => url.pathname === path && url.search === '');
        await expect(page.getByRole('banner').getByRole('heading', { level: 1 })).toHaveText(title);
        await expect(navigation.getByRole('link', { name: linkName, exact: true })).toHaveAttribute(
          'aria-current',
          'page',
        );
        await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
        await expect(page.getByRole('banner').getByRole('link', { name: '검색', exact: true })).toBeEnabled();
        await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toBeEnabled();
        await expect(page.getByRole('status', { name: '게시글 불러오는 중' })).toBeVisible();
        await expect(page.locator('.post-card:visible')).toHaveCount(0);
      });
      await expect(page.locator('.post-card:visible').first()).toBeVisible();
      expect(await page.evaluate(() => history.length)).toBe(historyLength);
    }
  });

  test(`the prefetched feed keeps its title and controls while only the list loads at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const waitForPrefetch = trackPrefetches({ page });
    await page.goto('/ko/guide');
    const navigation = width === 400 ? page.locator('.mobile-nav') : page.locator('.left-sidebar');
    const home = navigation.getByRole('link', { name: '홈', exact: true });
    await home.hover();
    await waitForPrefetch('/ko');
    try {
      await instant(page, async () => {
        await home.click();
        await page.waitForURL((url) => url.pathname === '/ko');
        await expect(page.getByRole('heading', { name: '전체', exact: true })).toBeVisible();
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
      const heading = await page.getByRole('banner').locator('.topbar-title').boundingBox();
      await expect(page.locator('.post-card:visible').first()).toBeVisible();
      await expect(search).toHaveAttribute('data-shell-persistence', 'kept');
      const loadedHeading = await page.getByRole('banner').locator('.topbar-title').boundingBox();
      expect(loadedHeading?.y).toBe(heading?.y);
      expect(loadedHeading?.height).toBe(heading?.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await page.close();
    }
  });
}

for (const [name, source, board, parent, submit] of [
  ['feed', '/ko', 'FEEDBACK', '/ko', '피드백 요청 올리기'],
  [
    'friendly',
    '/ko/boards/friendly?battleMode=TEAM',
    'FRIENDLY',
    '/ko/boards/friendly?battleMode=TEAM',
    '게시글 등록',
  ],
] as const) {
  test(`the signed-in ${name} FAB prefetches a compose shell before its interactive form streams`, async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const login = await context.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-0' },
    });
    expect(login.ok()).toBe(true);
    const waitForPrefetch = trackPrefetches({ page, contentOnly: true });
    await page.goto(source);
    const entry = page.getByRole('button', { name: '글쓰기', exact: true });
    await expect(entry).toBeEnabled();
    await waitForPrefetch('/ko/write');
    await instant(page, async () => {
      await entry.click();
      await page.waitForURL((url) => url.pathname === '/ko/write');
      await expect(page.getByRole('heading', { name: '글쓰기', level: 1, exact: true })).toBeVisible();
      await expect(page.getByRole('status', { name: '글쓰기', exact: true })).toBeVisible();
      await expect(page.getByRole('form', { name: '글쓰기', exact: true })).toHaveCount(0);
      await expect(page.locator('.topbar:visible')).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`${name}-compose-pending.png`) });
    });
    const form = page.getByRole('form', { name: '글쓰기', exact: true });
    await expect(form).toBeVisible();
    await expect(form.getByRole('combobox', { name: '분류', exact: true })).toHaveValue(board);
    // 기본 게임이 정해지지 않으면 등록 버튼이 비활성으로 남는다.
    await expect(form.getByRole('button', { name: submit, exact: true })).toBeEnabled();
    if (board === 'FRIENDLY') {
      expect(new URL(page.url()).searchParams.get('battleMode')).toBe('TEAM');
      await expect(form.getByRole('combobox', { name: '전투 유형', exact: true })).toHaveValue('TEAM');
    }
    await expect(page.getByRole('link', { name: '돌아가기', exact: true })).toHaveAttribute('href', parent);
    await form.getByRole('textbox', { name: '제목', exact: true }).fill('즉시 작성 확인');
    await expect(form.getByRole('textbox', { name: '제목', exact: true })).toHaveValue('즉시 작성 확인');
    await page.screenshot({ path: testInfo.outputPath(`${name}-compose-ready.png`) });
  });
}

test('a production navigation shows the prefetched guide with its own page header', async ({ page }) => {
  const waitForPrefetch = trackPrefetches({ page, contentOnly: true });
  // 무한 피드의 페이지 추가는 푸터 prefetch를 취소한다. 헤더 교체 검사는 높이가 고정된 안내 화면에서 한다.
  await page.goto('/ko/terms');
  await expect(page.getByRole('banner').locator('.topbar-title')).toHaveText('이용약관');
  const guide = page.locator('.site-footer').getByRole('link', { name: '이용 가이드', exact: true });
  await guide.hover();
  await waitForPrefetch('/ko/guide');
  await page.evaluate(() =>
    Object.defineProperty(window, '__navigationDocument', { value: 'kept', configurable: true }),
  );
  await instant(page, async () => {
    await guide.click();
    await page.waitForURL((url) => url.pathname === '/ko/guide');
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('banner').locator('.topbar-title')).toHaveText('가이드');
    await expect(page.getByRole('banner').getByRole('link', { name: '검색', exact: true })).toHaveCount(0);
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
  const waitForPrefetch = trackPrefetches({ page });
  await page.goto('/ko');
  const post = page.locator('.post-title-link:visible').first();
  await expect(post).toBeVisible();
  const href = await post.getAttribute('href');
  const target = new URL(href ?? '', origin).pathname;
  await post.hover();
  await waitForPrefetch(target);
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
    await expect(page.getByRole('banner').getByRole('heading', { level: 1 })).toHaveText('すべて');
    await expect(page.locator('.post-card').first()).toBeVisible();
    for (const slug of ['feedback', 'friend-sale', 'friendly', 'coaching', 'free']) {
      const response = await page.goto(`/ko/boards/${slug}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('.board-post-list .post-card').first()).toBeVisible();
    }
    await page.goto('/ko/posts/sample-post-0');
    await expect(page.locator('.detail-card:visible')).toBeVisible();
    await expect(page.locator('.detail-card:visible')).toHaveCSS('background-color', 'rgb(28, 27, 26)');
    await expect(page).toHaveTitle(/ \| Game Mate$/);
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
