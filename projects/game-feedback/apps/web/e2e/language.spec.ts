import { test, expect } from '@playwright/test';

test('first visits use the browser region without JavaScript and retain feed filters', async ({
  browser,
}) => {
  for (const [locale, path, heading] of [
    ['ko-KR', 'ko', '플레이메이트'],
    ['ja-JP', 'ja', 'Playmate'],
    ['en-GB', 'en', 'Playmate'],
  ] as const) {
    const context = await browser.newContext({
      locale,
      javaScriptEnabled: false,
      baseURL: 'http://127.0.0.1:3301',
    });
    try {
      const page = await context.newPage();
      await page.goto('/?q=hog&tab=unanswered');
      await expect(page).toHaveURL(new RegExp(`/${path}\\?q=hog&tab=unanswered$`));
      await expect(page.locator('html')).toHaveAttribute('lang', path);
      await expect(page.getByRole('banner')).toContainText(heading);
    } finally {
      await context.close();
    }
  }
});

test('signed-out users can save a manual language, reload and resume automatic selection', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'ja-JP', baseURL: 'http://127.0.0.1:3301' });
  try {
    const page = await context.newPage();
    await page.goto('/ja/settings');
    const select = page.locator('#language-preference');
    await expect(select).toHaveValue('auto');
    await page.locator('html').evaluate((node) => node.setAttribute('data-language-document', 'kept'));
    await select.selectOption('en');
    await expect(page).toHaveURL(/\/en\/settings$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-language-document', 'kept');
    await expect(page.getByRole('heading', { name: 'Language', exact: true })).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL(/\/en$/);
    await page.goto('/en/settings');
    await expect(select).toHaveValue('en');
    await select.selectOption('auto');
    await expect(page).toHaveURL(/\/ja\/settings$/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/ja$/);
    await page.goto('/ko/posts/sample-post-0');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    expect((await context.cookies()).find((cookie) => cookie.name === 'gf_language')?.value).toBe('auto');
  } finally {
    await context.close();
  }
});
