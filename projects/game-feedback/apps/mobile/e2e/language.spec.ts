import { expect, test } from './support/fixtures';

test.use({ locale: 'ja-JP' });
test('WebView entry detects the device language and keeps a manual preference across reloads', async ({
  page,
  nativeHost,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/ja$/);
  await expect.poll(nativeHost.currentPath).toBe('/ja');
  await page.goto('/ja/settings#language');
  const language = page.locator('#language-preference:visible');
  await expect(language).toContainText('端末の設定に合わせる');
  await language.click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/settings#language$/);
  await expect.poll(nativeHost.currentPath).toBe('/en/settings');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/');
  await expect(page).toHaveURL(/\/en$/);
  await expect.poll(nativeHost.currentPath).toBe('/en');
  await expect(page.getByRole('navigation', { name: 'Mobile menu' })).toBeVisible();
  await page.goto('/en/settings#language');
  await expect(language).toContainText('English');
  await page
    .getByRole('region', { name: 'Language', exact: true })
    .getByRole('combobox', { name: 'Language settings', exact: true })
    .click();
  await page.getByRole('option', { name: 'Use device settings', exact: true }).click();
  await expect(page).toHaveURL(/\/ja\/settings#language$/);
  await expect.poll(nativeHost.currentPath).toBe('/ja/settings');
  await expect(language).toContainText('端末の設定に合わせる');
});
