import { expect, test } from '@playwright/test';

import index from '../../src/shared/article/lib/index.json' with { type: 'json' };

test('summary titles follow the article language when reading translations', async ({ page }) => {
  for (const [locale, title] of [
    ['en', 'Summary'],
    ['ko', '요약'],
  ] as const) {
    const article = index.find(
      (entry) => entry.id === 'side-project-infrastructure' && entry.locale === locale,
    );
    if (!article) throw new Error(`Missing infrastructure article in ${locale}`);
    await page.goto(`/${locale}/blog/${encodeURIComponent(article.slug)}`);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('.note-summary > .note-title')).toHaveText(title);
    await page.reload();
    await expect(page.locator('.note-summary > .note-title')).toHaveText(title);
  }
});
