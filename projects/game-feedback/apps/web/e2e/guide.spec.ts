import { expect, test } from './support/test';

for (const { width, locale } of [
  { width: 320, locale: 'ko' },
  { width: 393, locale: 'en' },
  { width: 393, locale: 'ja' },
  { width: 1440, locale: 'ko' },
]) {
  test(`${locale} ${width}px 가이드는 대표 그림과 문단으로 읽고 본문에 화살표나 바로가기를 넣지 않아야 한다`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/${locale}/guide`);
    const guide = page.getByRole('article');
    await expect(guide).toHaveClass('info-card');
    await expect(guide.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(guide).toHaveAttribute('lang', locale);
    await expect(guide.getByRole('heading', { level: 2 })).toHaveCount(9);
    await expect(guide.getByRole('term')).toHaveCount(5);
    await expect(guide.getByRole('link')).toHaveCount(0);
    const illustration = guide.locator('[data-motion="game"]');
    await expect(illustration).toHaveCount(1);
    await expect(illustration).toHaveAttribute('aria-hidden', 'true');
    await expect(guide.locator('.guide-sections svg')).toHaveCount(0);
    if (locale !== 'ko') expect(await guide.innerText()).not.toMatch(/[가-힣]/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`guide-${locale}-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(20, 19, 18)');
    await page.screenshot({
      path: testInfo.outputPath(`guide-${locale}-${width}-dark.png`),
      fullPage: true,
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });
}

test('가이드는 주 탭에서 빠지고 프로필 안내에서 열었다가 이전 화면으로 돌아갈 수 있어야 한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/ko/settings');
  const tabs = page.getByRole('navigation', { name: '모바일 메뉴', exact: true });
  await expect(tabs.getByRole('link')).toHaveText(['홈', '채팅', '프로필']);
  const length = await page.evaluate(() => history.length);
  await page.getByRole('main').getByRole('link', { name: '이용 가이드', exact: true }).click();
  await expect(page).toHaveURL('/ko/guide');
  expect(await page.evaluate(() => history.length)).toBe(length + 1);
  await expect(tabs.getByRole('link', { name: '프로필', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('banner').getByRole('link', { name: '돌아가기', exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL('/ko/settings');
  await page
    .getByRole('navigation', { name: '서비스 안내', exact: true })
    .getByRole('link', { name: '이용 가이드', exact: true })
    .click();
  await expect(page).toHaveURL('/ko/guide');
});
