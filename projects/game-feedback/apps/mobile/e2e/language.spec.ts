import { test, expect } from './support/fixtures';

test.use({ locale: 'ja-JP' });
test('WebView entry detects the device language and keeps a manual preference across reloads', async ({
  page,
  nativeHost,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/ja$/);
  await expect.poll(nativeHost.currentPath).toBe('/ja');
  await page.goto('/ja/settings');
  await page.locator('#language-preference').selectOption('en');
  await expect(page).toHaveURL(/\/en\/settings$/);
  await expect.poll(nativeHost.currentPath).toBe('/en/settings');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/');
  await expect(page).toHaveURL(/\/en$/);
  await expect.poll(nativeHost.currentPath).toBe('/en');
  await expect(page.getByRole('navigation', { name: 'Mobile menu' })).toBeVisible();
});
