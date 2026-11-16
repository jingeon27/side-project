import { LEGAL_POLICY_VERSION } from '@game-feedback/contracts';

import { expect, test } from './support/test';

for (const locale of ['en', 'ja'] as const) {
  test(`guide and policy content, metadata and canonical links are localized in ${locale} without JavaScript`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      viewport: { width: 393, height: 852 },
    });
    try {
      const page = await context.newPage();
      for (const kind of ['guide', 'terms', 'privacy', 'contact']) {
        expect((await page.goto(`/${locale}/${kind}`))?.status()).toBe(200);
        const content = page.getByRole('article');
        await expect(content).toHaveAttribute('lang', locale);
        expect(await content.innerText()).not.toMatch(/[가-힣]/);
        if (kind === 'terms' || kind === 'privacy') {
          await expect(content).not.toContainText(/alpha|draft|アルファ|草案/i);
          await expect(content).toContainText(LEGAL_POLICY_VERSION);
          await expect(content).toContainText('Kim Jingeon');
          await expect(content.locator('a[href="mailto:contact@bambyul.com"]').first()).toBeVisible();
          expect(await page.locator('meta[name="description"]').getAttribute('content')).not.toMatch(
            /alpha|draft|アルファ|草案/i,
          );
        }
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
          'href',
          `https://feedback.example/${locale}/${kind}`,
        );
        await expect(page.locator('link[hreflang="en"]')).toHaveAttribute(
          'href',
          `https://feedback.example/en/${kind}`,
        );
        await expect(page.locator('link[hreflang="ja"]')).toHaveAttribute(
          'href',
          `https://feedback.example/ja/${kind}`,
        );
        const data = JSON.parse(
          (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
        );
        expect(data['@graph'][1]).toMatchObject({
          inLanguage: locale,
          url: `https://feedback.example/${locale}/${kind}`,
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        if (kind === 'guide' || kind === 'terms' || kind === 'privacy') {
          const home = page.locator('a.back-link');
          await expect(home).toHaveAttribute('href', `/${locale}`);
          await home.click();
          await expect(page).toHaveURL(`/${locale}`);
        }
      }
    } finally {
      await context.close();
    }
  });
}
