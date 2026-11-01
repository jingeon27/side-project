import { expect, test } from './support/test';

for (const width of [1024, 1280, 1920]) {
  test(`${width}px 데스크톱은 빈 피드에서도 탐색 영역과 본문 규격을 유지한다`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ko');
    const main = page.getByRole('main');
    const sidebar = page.locator('.shell-left-sidebar:visible');
    const header = page.getByRole('banner');
    await expect(sidebar.getByRole('link', { name: 'Game Mate 홈', exact: true })).toHaveAttribute(
      'href',
      '/ko',
    );
    await expect(sidebar.getByText('둘러보기', { exact: true })).toHaveCount(0);
    const card = page.locator('.post-card:visible').first();
    await expect(card).toBeVisible();
    const populatedMain = await main.boundingBox();
    const cardBounds = await card.boundingBox();
    const sidebarBounds = await sidebar.boundingBox();
    const headerBounds = await header.boundingBox();
    expect(populatedMain).not.toBeNull();
    expect(populatedMain?.height).toBeGreaterThanOrEqual(900);
    expect(cardBounds?.width).toBeLessThanOrEqual(680);
    expect(sidebarBounds?.x).toBe(0);
    expect(sidebarBounds?.y).toBe(0);
    expect(sidebarBounds?.height).toBeGreaterThanOrEqual(900);
    expect(headerBounds?.x).toBe(sidebarBounds?.width);

    await page.route(/\/api\/posts(?:\?.*)?$/, (route) =>
      route.fulfill({ json: { items: [], nextCursor: null } }),
    );
    await page.reload();
    const empty = page.locator('.empty-feed:visible');
    await expect(empty.getByRole('heading', { name: '첫 번째 이야기를 기다려요' })).toBeVisible();
    await expect(page.locator('.post-card:visible')).toHaveCount(0);
    const emptyMain = await main.boundingBox();
    const emptyBounds = await empty.boundingBox();
    const footerBounds = await page.getByRole('contentinfo').boundingBox();
    expect(emptyMain?.x).toBe(populatedMain?.x);
    expect(emptyMain?.width).toBe(populatedMain?.width);
    expect(emptyMain?.height).toBeGreaterThanOrEqual(900);
    expect(emptyBounds?.width).toBe(cardBounds?.width);
    expect(emptyBounds?.height).toBeGreaterThanOrEqual(320);
    expect(footerBounds?.x).toBe(sidebarBounds?.width);
    expect(footerBounds?.y).toBeGreaterThanOrEqual((emptyMain?.y ?? 0) + (emptyMain?.height ?? 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('empty-desktop.png') });
  });
}

test('390px 빈 피드는 기존 칩과 하단 메뉴, 글쓰기를 유지한다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/api\/posts(?:\?.*)?$/, (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await page.goto('/ko');
  await expect(page.getByRole('heading', { name: '첫 번째 이야기를 기다려요' })).toBeVisible();
  await expect(page.locator('.shell-left-sidebar:visible')).toHaveCount(0);
  await expect(page.locator('.game-board-navigation:visible')).toBeVisible();
  await expect(page.locator('.mobile-nav')).toBeVisible();
  await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('empty-mobile.png') });
});

test('데스크톱 게시판은 피드와 같은 읽기 폭을 유지하고 짧은 화면에서도 메뉴를 탐색한다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto('/ko/boards/free');
  const board = page.locator('.board-page:visible');
  await expect(board.locator('.post-card').first()).toBeVisible();
  expect((await board.boundingBox())?.width).toBe(680);
  const sidebar = page.locator('.left-sidebar:visible');
  await expect(sidebar).toHaveCSS('overflow-y', 'auto');
  const feedback = sidebar.getByRole('link', { name: '피드백', exact: true });
  await feedback.focus();
  await expect(feedback).toBeInViewport();
  await page.route(/\/api\/posts(?:\?.*)?$/, (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await page.reload();
  await expect(board.locator('.board-empty')).toBeVisible();
  expect((await board.boundingBox())?.width).toBe(680);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('empty-board.png') });
});
