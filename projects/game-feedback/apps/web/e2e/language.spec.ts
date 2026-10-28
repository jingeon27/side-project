import { expect, test } from './support/test';

const origin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3301';

test('first visits use the browser region without JavaScript and retain feed filters', async ({
  browser,
}) => {
  for (const [locale, path, heading] of [
    ['ko-KR', 'ko', 'Game Mate'],
    ['ja-JP', 'ja', 'Game Mate'],
    ['en-GB', 'en', 'Game Mate'],
  ] as const) {
    const context = await browser.newContext({
      locale,
      javaScriptEnabled: false,
      baseURL: origin,
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
  const context = await browser.newContext({ locale: 'ja-JP', baseURL: origin });
  try {
    const page = await context.newPage();
    await page.goto('/ja/settings');
    const select = page.locator('#language-preference:visible');
    await expect(select).toContainText('端末の設定に合わせる');
    await page.evaluate(() =>
      Object.defineProperty(window, '__languageDocument', { value: 'kept', configurable: true }),
    );
    await select.click();
    await page.getByRole('option', { name: 'English', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/settings$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await page.evaluate(() => Reflect.get(window, '__languageDocument'))).toBe('kept');
    await expect(page.getByRole('heading', { name: 'Language', exact: true })).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL(/\/en$/);
    await page.goto('/en/settings');
    await expect(select).toContainText('English');
    await select.click();
    await page.getByRole('option', { name: 'Use device settings', exact: true }).click();
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
  const context = await browser.newContext({ locale: 'ja-JP', baseURL: origin });
  try {
    const page = await context.newPage();
    await page.goto('/ja?q=hog&tab=unanswered#feed');
    const language = page.getByRole('banner').getByRole('combobox');
    await expect(language).toContainText('端末の設定に合わせる');
    await page.evaluate(() =>
      Object.defineProperty(window, '__languageDocument', { value: 'kept', configurable: true }),
    );
    const length = await page.evaluate(() => history.length);
    await language.click();
    await page.getByRole('option', { name: 'English', exact: true }).click();
    await expect(page).toHaveURL('/en?q=hog&tab=unanswered#feed');
    await expect(page.getByRole('banner').getByRole('link', { name: 'Search', exact: true })).toHaveAttribute(
      'href',
      '/en/search?q=hog&tab=unanswered',
    );
    await expect(page.getByRole('button', { name: 'Unanswered', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(window, '__languageDocument'))).toBe('kept');
    expect(await page.evaluate(() => history.length)).toBe(length);
    expect((await context.cookies()).find((cookie) => cookie.name === 'gf_language')?.value).toBe('en');
    await page.goto('/');
    await expect(page).toHaveURL('/en');
    await expect(language).toContainText('English');
    await page.goto('/en/settings#language');
    await expect(page.locator('#language-preference:visible')).toContainText('English');
    await page.locator('#language-preference:visible').click();
    await page.getByRole('option', { name: 'Use device settings', exact: true }).click();
    await expect(page).toHaveURL('/ja/settings#language');
    await expect(language).toContainText('端末の設定に合わせる');
    await page.goto('/ja/posts/sample-post-0');
    await language.click();
    await page.getByRole('option', { name: '한국어', exact: true }).click();
    await expect(page).toHaveURL('/ko/posts/sample-post-0');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('language changes keep the page visible and disable both selectors until the new language arrives', async ({
  page,
}) => {
  await page.goto('/ko/settings');
  const navigation = Promise.withResolvers<void>();
  await page.route('**/en/settings**', async (route) => {
    if (route.request().headers().rsc) await navigation.promise;
    await route.continue();
  });
  try {
    await page.locator('#language-preference:visible').click();
    await page.getByRole('option', { name: 'English', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '언어를 변경하고 있어요' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '나의 플레이 공간', exact: true })).toBeVisible();
    await expect(page.locator('.page-loading-screen')).toHaveCount(0);
    await expect(page.locator('#language-preference:visible')).toBeDisabled();
    await expect(page.getByRole('banner').getByRole('combobox')).toBeDisabled();
  } finally {
    navigation.resolve();
    await page.unrouteAll({ behavior: 'wait' });
  }
  await expect(page).toHaveURL('/en/settings');
  await expect(page.getByRole('heading', { name: 'Language', exact: true })).toBeVisible();
  await expect(page.locator('#language-preference:visible')).toBeEnabled();
  await expect(page.locator('.preference-progress')).toHaveCount(0);
});
