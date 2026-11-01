import { expect, test } from './support/test';

const sections = [
  { path: '', labels: ['전체', 'All', 'すべて'] },
  { path: '/boards/feedback', labels: ['피드백', 'Feedback', 'フィードバック'] },
  { path: '/boards/friend-sale', labels: ['친추판매', 'Friend slots for sale', 'フレンド枠販売'] },
  { path: '/boards/friendly', labels: ['전투 모집', 'Battle recruitment', '対戦募集'] },
  { path: '/boards/coaching', labels: ['게임코치', 'Game coaching', 'ゲームコーチ'] },
  { path: '/boards/free', labels: ['자유게시판', 'General', '自由掲示板'] },
  { path: '/messages', labels: ['채팅', 'Chat', 'チャット'] },
  { path: '/settings', labels: ['프로필', 'Profile', 'プロフィール'] },
] as const;

for (const width of [320, 1440]) {
  for (const [index, locale] of ['ko', 'en', 'ja'].entries()) {
    test(`the ${locale} header identifies every current section at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      for (const section of sections) {
        await page.goto(`/${locale}${section.path}`);
        const header = page.getByRole('banner');
        await expect(header.locator('.topbar-title')).toHaveText(section.labels[index] ?? '');
        await expect(header.locator('.topbar-title')).toBeVisible();
        await expect(header.getByRole('heading', { level: 1 })).toHaveText(section.labels[index] ?? '');
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(header.locator('img, .brand')).toHaveCount(0);
        await expect(page.getByRole('main').locator('.feed-heading, .board-heading')).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (locale === 'ko' && section.path === '')
          await page.screenshot({ path: `.data/screens/header-tabs-${width}-all.png` });
      }
    });
  }
}

test('switching boards updates the only page heading and keeps its floating compose action', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ko');
  const header = page.getByRole('banner');
  await expect(header.locator('.topbar-title')).toHaveText('전체');
  await page
    .getByRole('navigation', { name: '클래시로얄 게시판', exact: true })
    .getByRole('link', { name: '게임코치', exact: true })
    .click();
  await expect(header.locator('.topbar-title')).toHaveText('게임코치');
  await expect(page.getByRole('heading', { name: '게임코치', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toBeVisible();
});

for (const width of [360, 390]) {
  test(`sticky board chips hide scrolling down and reveal scrolling up beneath the header at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/ko');
    const chips = page.locator('main:visible .game-board-navigation');
    const header = page.getByRole('banner');
    await expect(chips).toBeVisible();
    await expect(chips).toHaveCSS('position', 'sticky');
    const initialHeader = await header.boundingBox();
    const initialTitle = await chips.locator('.game-board-title').boundingBox();
    const initialGap = (initialTitle?.y ?? 0) - (initialHeader?.y ?? 0) - (initialHeader?.height ?? 0);
    expect(initialGap).toBeGreaterThanOrEqual(16);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight))
      .toBeGreaterThan(500);
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      const gesture = cdp.send('Input.synthesizeScrollGesture', {
        x: Math.floor(width / 2),
        y: 650,
        yDistance: -500,
        speed: 500,
        gestureSourceType: 'touch',
      });
      await expect(chips).toHaveAttribute('data-scroll-hidden', 'true');
      await expect(chips).toBeHidden();
      await gesture;
      await expect(page.getByRole('button', { name: '글쓰기', exact: true })).not.toHaveAttribute(
        'data-scrolling',
        'true',
      );
      await expect(chips).toBeHidden();
      await cdp.send('Input.synthesizeScrollGesture', {
        x: Math.floor(width / 2),
        y: 500,
        yDistance: 160,
        speed: 500,
        gestureSourceType: 'touch',
      });
      await expect(chips).not.toHaveAttribute('data-scroll-hidden');
      await expect(chips).toBeVisible();
      await expect
        .poll(async () => (await chips.boundingBox())?.y)
        .toBe((await header.boundingBox())?.height);
      await expect
        .poll(async () => {
          const headerBounds = await header.boundingBox();
          const titleBounds = await chips.locator('.game-board-title').boundingBox();
          return Math.abs(
            (titleBounds?.y ?? 0) - (headerBounds?.y ?? 0) - (headerBounds?.height ?? 0) - initialGap,
          );
        })
        .toBeLessThanOrEqual(1);
      await page.screenshot({ path: `.data/screens/header-tabs-${width}-idle.png` });

      const selected = chips.getByRole('link', { name: '전체', exact: true });
      await selected.focus();
      await page.evaluate(() => window.scrollBy({ top: 40, behavior: 'instant' }));
      await expect(chips).toHaveAttribute('data-scroll-hidden', 'true');
      await expect(chips).toBeHidden();
      await expect(chips).toHaveAttribute('inert', '');
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !document.activeElement?.closest('.game-board-navigation'))).toBe(
        true,
      );
      await page.evaluate(() => window.scrollBy({ top: -60, behavior: 'instant' }));
      await expect(chips).toBeVisible();

      await chips.getByRole('link', { name: '자유게시판', exact: true }).click();
      await expect(header.getByRole('heading', { name: '자유게시판', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toBeVisible();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => window.scrollTo({ top: 150, behavior: 'instant' }));
      await expect(chips).toHaveAttribute('data-scroll-hidden', 'true');
      await expect(chips).toBeHidden();
      await page.evaluate(() => window.scrollBy({ top: -80, behavior: 'instant' }));
      await expect(chips).not.toHaveAttribute('data-scroll-hidden');
      await expect(chips).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await cdp.detach();
    }
  });
}
