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

test('unmatched routes keep the requested language in the complete 404 page', async ({ page }) => {
  for (const [locale, title, home] of [
    ['en', 'This page could not be found.', 'Back to home'],
    ['ko', '페이지를 찾을 수 없습니다.', '홈으로 돌아가기'],
  ] as const) {
    const response = await page.goto(`/${locale}/missing-localized-page`);
    expect(response?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByRole('link', { name: home })).toHaveAttribute('href', `/${locale}`);
  }
});

test('English articles contain translated reading text and common labels', async ({ page, request }) => {
  for (const article of index.filter((entry) => entry.locale === 'en')) {
    const response = await request.get(`/en/blog/${encodeURIComponent(article.slug)}`);
    expect(response.status(), article.id).toBe(200);
    const text = await page.evaluate(
      (html) => {
        const document = new DOMParser().parseFromString(html, 'text/html');
        return document.querySelector('.article-prose')?.textContent;
      },
      await response.text(),
    );
    expect(text, article.id).toBeTruthy();
    expect(text, article.id).not.toMatch(/[가-힣ㄱ-ㅎㅏ-ㅣ]/);
  }
  await page.goto('/en');
  await expect(page.getByRole('button', { name: 'Change language: KO (Korean)' })).toBeVisible();
});
