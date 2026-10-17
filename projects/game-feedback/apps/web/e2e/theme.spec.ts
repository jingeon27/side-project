import { test, expect, type Page } from '@playwright/test';

const origin = 'http://127.0.0.1:3301';
async function background(page: Page) {
  return page.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor);
}
for (const width of [400, 1440]) {
  test(`profile appearance follows the device and persists an explicit preference (${width})`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/ko/settings');
    const mode = page.getByRole('combobox', { name: '화면 모드', exact: true });
    await expect(mode).toHaveText('기기 설정에 맞춤');
    const light = await background(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => background(page)).not.toBe(light);
    const dark = await background(page);
    await mode.click();
    await page.getByRole('option', { name: '라이트 모드', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => background(page)).toBe(light);
    await page.reload();
    await expect(mode).toHaveText('라이트 모드');
    await mode.click();
    await page.getByRole('option', { name: '다크 모드', exact: true }).click();
    await expect.poll(() => background(page)).toBe(dark);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => background(page)).toBe(dark);
    await page.goto('/ko');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.topbar').getByRole('combobox', { name: '화면 모드' })).toHaveCount(0);
    const write = page.locator('.feed-heading').getByRole('button', { name: '글쓰기', exact: true });
    await write.click();
    const login = page.getByRole('dialog');
    await expect(login).toBeVisible();
    await expect(login.getByLabel('서비스 닉네임')).toHaveCSS('color', 'rgb(244, 241, 235)');
    await login.getByRole('button', { name: '닫기', exact: true }).click();
    expect((await context.cookies()).find((cookie) => cookie.name === 'gf_theme')?.value).toBe('dark');
  });
}

test('the server applies a saved dark preference before JavaScript runs', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: origin,
    javaScriptEnabled: false,
    colorScheme: 'light',
  });
  try {
    await context.addCookies([{ name: 'gf_theme', value: 'dark', url: origin }]);
    const page = await context.newPage();
    await page.goto('/ko/posts/sample-post-0');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.detail-card')).toBeVisible();
    await expect(page.locator('.detail-card')).toHaveCSS('background-color', 'rgb(28, 27, 26)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await context.close();
  }
});
