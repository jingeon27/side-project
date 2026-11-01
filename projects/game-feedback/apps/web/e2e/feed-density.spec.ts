import { expect, test } from './support/test';

for (const width of [320, 390, 430]) {
  test(`${width}px 홈은 글쓰기를 고정하고 작성자와 인증을 한 줄로 보여야 한다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/ko');
    const navigation = page.locator('.game-board-navigation:visible');
    const compose = page.getByRole('button', { name: '글쓰기', exact: true });
    await expect(compose).toBeVisible();
    await expect(compose).toHaveCSS('position', 'fixed');
    await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toHaveCount(1);
    const chips = navigation.locator('.game-board-chips');
    const chipLinks = chips.getByRole('link');
    await expect(chipLinks).toHaveText(['전체', '친추판매', '전투 모집', '게임코치', '자유게시판', '피드백']);
    await expect(chips).toHaveCSS('flex-wrap', 'nowrap');
    const chipRows = await chipLinks.evaluateAll((links) =>
      links.map((link) => Math.round(link.getBoundingClientRect().top)),
    );
    expect(new Set(chipRows).size).toBe(1);
    await expect(chipLinks.first()).toBeInViewport({ ratio: 1 });
    await chipLinks.last().focus();
    await expect(chipLinks.last()).toBeInViewport({ ratio: 1 });
    expect(await chips.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await chipLinks.last().press('Enter');
    await expect(page).toHaveURL('/ko/boards/feedback');
    const currentChip = navigation.locator('[aria-current="page"]');
    await expect(currentChip).toHaveText('피드백');
    await expect(currentChip).toBeInViewport({ ratio: 1 });
    await page.goto('/ko');
    await expect(navigation.locator('[aria-current="page"]')).toHaveText('전체');
    await expect(chipLinks.first()).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const cards = page.locator('.post-card');
    await expect(cards.first()).toBeVisible();
    const navigationBounds = await navigation.boundingBox();
    const cardBounds = await cards.first().boundingBox();
    expect(navigationBounds).not.toBeNull();
    expect(cardBounds).not.toBeNull();
    expect(
      (cardBounds?.y ?? 0) - (navigationBounds?.y ?? 0) - (navigationBounds?.height ?? 0),
    ).toBeLessThanOrEqual(20);
    const verified = cards.filter({ has: page.getByRole('link', { name: '덱연구소 프로필' }) }).first();
    await expect(verified.getByText('인증 유저', { exact: true })).toBeVisible();
    await expect(verified.locator('.post-author')).not.toContainText('#');
    const author = await verified.locator('.post-author > strong').boundingBox();
    const badge = await verified.locator('.user-badges').boundingBox();
    expect(author).not.toBeNull();
    expect(badge).not.toBeNull();
    expect(
      Math.abs((author?.y ?? 0) + (author?.height ?? 0) / 2 - (badge?.y ?? 0) - (badge?.height ?? 0) / 2),
    ).toBeLessThanOrEqual(1);
    await compose.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('form', { name: '글쓰기', exact: true })).toHaveCount(0);
  });
}

test('데스크톱도 글쓰기 진입을 하나만 유지하고 상세와 프로필에서는 게임 태그를 보여야 한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ko');
  await expect(page.getByRole('heading', { name: '전체', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toHaveCount(1);
  const verified = page
    .locator('.post-card')
    .filter({ has: page.getByRole('link', { name: '덱연구소 프로필' }) })
    .first();
  await expect(verified.locator('.post-author')).not.toContainText('#');
  await verified.getByRole('link', { name: '덱연구소 프로필' }).click();
  await expect(page.locator('.public-profile .user-badges')).toContainText('#');
  await expect(page.locator('.public-profile .user-badges')).toContainText('인증 유저');
  await page.goto('/ko/posts/sample-friend-sale-0');
  await expect(page.locator('.detail-author .user-badges')).toContainText('#');
});
