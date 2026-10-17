import { test, expect } from './support/fixtures';

test.use({ locale: 'ja-JP' });
test('WebView entry detects the device language and keeps a manual preference across reloads', async ({
  page,
  nativeHost,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/ja$/);
  await expect.poll(nativeHost.currentPath).toBe('/ja');
  const language = page.getByRole('banner').getByRole('combobox');
  await expect(language).toHaveValue('auto');
  await language.selectOption('en');
  await expect(page).toHaveURL(/\/en$/);
  await expect.poll(nativeHost.currentPath).toBe('/en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/');
  await expect(page).toHaveURL(/\/en$/);
  await expect.poll(nativeHost.currentPath).toBe('/en');
  await expect(page.getByRole('navigation', { name: 'Mobile menu' })).toBeVisible();
  await expect(language).toHaveValue('en');
  await page.goto('/en/settings#language');
  await page.locator('#language-preference').selectOption('auto');
  await expect(page).toHaveURL(/\/ja\/settings#language$/);
  await expect.poll(nativeHost.currentPath).toBe('/ja/settings');
  await expect(language).toHaveValue('auto');
});
