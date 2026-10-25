import { expect, test } from '@playwright/test';

test('기기 언어가 이미 선택돼 있어도 다른 언어 경로에서 다시 적용할 수 있어야 한다', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'ko-KR', baseURL: 'http://127.0.0.1:3301' });
  try {
    const page = await context.newPage();
    await page.goto('/en/settings#language');
    const select = page.locator('#language-preference:visible');
    await expect(select).toContainText('Use device settings');
    const length = await page.evaluate(() => history.length);
    await select.click();
    await page.getByRole('option', { name: 'Use device settings', exact: true }).click();
    await expect(page).toHaveURL('/ko/settings#language');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await expect(page.locator('#language-preference:visible')).toContainText('기기 설정에 맞춤');
    expect(await page.evaluate(() => history.length)).toBe(length);
    expect((await context.cookies()).find((cookie) => cookie.name === 'gf_language')?.value).toBe('auto');
  } finally {
    await context.close();
  }
});
