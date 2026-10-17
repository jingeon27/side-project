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

test('the header dropdown preserves the current page, filters and hash while sharing the saved preference', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'ja-JP', baseURL: 'http://127.0.0.1:3301' });
  try {
    const page = await context.newPage();
    await page.goto('/ja?q=hog&tab=unanswered#feed');
    const language = page.getByRole('banner').getByRole('combobox');
    await expect(language).toHaveValue('auto');
    await page.locator('html').evaluate((node) => node.setAttribute('data-language-document', 'kept'));
    const length = await page.evaluate(() => history.length);
    await language.selectOption('en');
    await expect(page).toHaveURL('/en?q=hog&tab=unanswered#feed');
    await expect(page.getByRole('textbox', { name: 'Search posts', exact: true })).toHaveValue('hog');
    await expect(page.getByRole('button', { name: 'Unanswered', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('html')).toHaveAttribute('data-language-document', 'kept');
    expect(await page.evaluate(() => history.length)).toBe(length);
    expect((await context.cookies()).find((cookie) => cookie.name === 'gf_language')?.value).toBe('en');
    await page.goto('/');
    await expect(page).toHaveURL('/en');
    await expect(language).toHaveValue('en');
    await page.goto('/en/settings#language');
    await expect(page.locator('#language-preference')).toHaveValue('en');
    await page.locator('#language-preference').selectOption('auto');
    await expect(page).toHaveURL('/ja/settings#language');
    await expect(language).toHaveValue('auto');
    await page.goto('/ja/posts/sample-post-0');
    await language.selectOption('ko');
    await expect(page).toHaveURL('/ko/posts/sample-post-0');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  } finally {
    await context.close();
  }
});
