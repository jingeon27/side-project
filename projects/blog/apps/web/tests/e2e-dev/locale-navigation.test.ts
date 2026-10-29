import { expect, test } from '@playwright/test';

import en from '../../messages/en.json' with { type: 'json' };
import ko from '../../messages/ko.json' with { type: 'json' };

for (const { saved, system, expected } of [
  { saved: 'dark', system: 'light', expected: 'dark' },
  { saved: 'light', system: 'dark', expected: 'light' },
  { saved: null, system: 'dark', expected: 'dark' },
] as const) {
  test(`initial theme is ${expected} with saved=${saved} and system=${system}, before hydration`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: system });
    await page.addInitScript((theme) => {
      if (theme) {
        localStorage.setItem('blog-theme', theme);
        return;
      }
      localStorage.removeItem('blog-theme');
    }, saved);
    await page.route(/\/_next\/.*\.js(?:\?.*)?$/, (route) => route.abort());
    await page.goto('/ko', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
    await expect(page.locator('#blog-initial-theme')).toHaveCount(1);
  });
}

test('language navigation preserves the theme without rendering an executable script on the client', async ({
  page,
}) => {
  const scriptWarnings: string[] = [];
  const runtimeErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Encountered a script tag'))
      scriptWarnings.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/ko');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: ko.nav.theme, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  for (const [from, to] of [
    ['ko', 'en'],
    ['en', 'ko'],
  ] as const) {
    await page
      .getByRole('button', { name: new RegExp(`^${(from === 'ko' ? ko : en).nav.language}:`) })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${to}$`));
    await expect(page.locator('html')).toHaveAttribute('lang', to);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(
      page.getByRole('button', { name: (to === 'ko' ? ko : en).nav.theme, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  }

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('blog-theme'))).toBe('dark');
  expect(scriptWarnings).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});
