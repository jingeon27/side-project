import { expect, test } from '@playwright/test';

test('mobile titles follow the screen and game classifications stay inside their game', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 844 });
  await page.goto('/ko');
  const header = page.getByRole('banner');
  await expect(header.locator('.brand')).toBeHidden();
  await expect(header.locator('.mobile-page-title')).toHaveText('홈');
  await expect(header.getByRole('link', { name: '검색', exact: true })).toHaveAttribute('href', '/ko/search');
  await expect(header.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('search')).toHaveCount(0);
  const game = page.locator('.game-category-group');
  await expect(game.locator('.game-board-title')).toContainText('클래시로얄');
  await expect(game.locator('.game-board-chips').getByRole('link')).toHaveText([
    '전체',
    '피드백',
    '친추판매',
    '전투 모집',
    '게임코치',
    '자유게시판',
  ]);
  await expect(game.getByRole('link', { name: '전체', exact: true })).toHaveAttribute('aria-current', 'page');
  await game.getByRole('link', { name: '전투 모집', exact: true }).click();
  await expect(header.getByRole('link', { name: '검색', exact: true })).toHaveAttribute(
    'href',
    '/ko/search?board=friendly',
  );
  await expect(header.locator('.mobile-page-title')).toHaveText('홈');
  await expect(game.getByRole('link', { name: '전투 모집', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const menu = page.locator('.mobile-nav');
  for (const title of ['가이드', '채팅', '프로필', '홈']) {
    await menu.getByRole('link', { name: title, exact: true }).click();
    await expect(header.locator('.mobile-page-title')).toHaveText(title);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a slow language change displays a themed fallback and preserves route filters', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 400, height: 844 });
  await context.addCookies([{ name: 'gf_theme', value: 'dark', url: 'http://127.0.0.1:3301' }]);
  await page.goto('/ko/boards/friendly?battleMode=TEAM&q=team');
  const requests: string[] = [];
  await page.route(
    (url) => url.pathname === '/en/boards/friendly',
    async (route) => {
      requests.push(route.request().url());
      try {
        const loading = page.getByRole('status').filter({ hasText: '언어를 변경하고 있어요' });
        await expect(loading).toBeVisible();
        await expect(loading).toHaveCSS('background-color', 'rgb(28, 27, 26)');
        const box = await loading.boundingBox();
        expect(box).toMatchObject({ x: 0, y: 0, width: 400, height: 844 });
      } finally {
        await route.continue();
      }
    },
  );
  await page.getByRole('banner').getByRole('combobox', { name: '언어 설정', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expect(page).toHaveURL('/en/boards/friendly?battleMode=TEAM&q=team');
  await expect(page.locator('.page-loading-screen')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Battle recruitment', exact: true })).toBeVisible();
  await expect(page.locator('.battle-filters:visible a[aria-current="page"]')).toHaveText('Team battle');
  expect(requests.length).toBeGreaterThan(0);
});

for (const width of [320, 1440]) {
  test(`the header stays accessible while scrolling and keeps anchor targets visible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/ko/guide');
    await expect(page.getByRole('heading', { name: '문의와 신고', exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const header = page.getByRole('banner');
    await expect.poll(async () => (await header.boundingBox())?.y).toBe(0);
    await expect(header.getByRole('combobox', { name: '언어 설정', exact: true })).toBeInViewport({
      ratio: 1,
    });
    expect(
      await header.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(box.width / 2, box.height / 2));
      }),
    ).toBe(true);
    await header.getByRole('combobox', { name: '언어 설정', exact: true }).click();
    await page.getByRole('option', { name: 'English', exact: true }).click();
    await expect(page).toHaveURL('/en/guide');
    await expect.poll(async () => (await header.boundingBox())?.y).toBe(0);
    await page.goto('/en/settings#language');
    const language = page.locator('#language-preference:visible');
    await expect(language).toBeInViewport({ ratio: 1 });
    expect((await language.boundingBox())?.y).toBeGreaterThanOrEqual(
      (await header.boundingBox())?.height ?? 0,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('the guide describes current classifications, account verification and chat actions', async ({
  page,
}) => {
  await page.goto('/ko/guide');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: '이용 가이드', exact: true })).toBeVisible();
  await expect(main.getByRole('heading', { name: '코치와 수강생 모집', exact: true })).toBeVisible();
  await expect(main.getByText('글마다 따로 첨부할 필요가 없어요.', { exact: false })).toBeVisible();
  await expect(
    main.getByText('휴대폰 키보드의 줄바꿈은 메시지를 보내지 않고', { exact: false }),
  ).toBeVisible();
  await expect(main.getByRole('term')).toHaveText([
    '피드백',
    '친추판매',
    '전투 모집',
    '게임코치',
    '자유게시판',
  ]);
  await expect(main.getByText(/불러온 게임 프로필을.*첨부/)).toHaveCount(0);
  await main.getByRole('term').getByRole('link', { name: '게임코치', exact: true }).click();
  await expect(page).toHaveURL('/ko/boards/coaching');
});
