import { expect, test } from '@playwright/test';

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
      }
    } finally {
      await context.close();
    }
  });
}
