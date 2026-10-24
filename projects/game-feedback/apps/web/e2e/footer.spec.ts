import { expect, test } from '@playwright/test';

for (const width of [320, 1440]) {
  test(`service footer opens localized policy pages and stays above mobile navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const [locale, termsLabel, privacyLabel] of [
      ['ko', '서비스 이용약관', '개인정보 처리방침'],
      ['en', 'Terms of service', 'Privacy policy'],
      ['ja', '利用規約', 'プライバシーポリシー'],
    ] as const) {
      await page.goto(`/${locale}/guide`);
      const footer = page.getByRole('contentinfo');
      await expect(footer).toHaveCount(1);
      await expect(footer.locator('nav').getByRole('link')).toHaveCount(4);
      await expect(footer.getByRole('link', { name: 'contact@bambyul.com', exact: true })).toHaveAttribute(
        'href',
        'mailto:contact@bambyul.com',
      );
      await expect(footer.locator('a[href="/' + locale + '/guide"]')).toHaveCount(1);
      await expect(footer.getByRole('link', { name: termsLabel, exact: true })).toHaveAttribute(
        'href',
        `/${locale}/terms`,
      );
      await expect(footer.getByRole('link', { name: privacyLabel, exact: true })).toHaveAttribute(
        'href',
        `/${locale}/privacy`,
      );
      await footer.scrollIntoViewIfNeeded();
      if (width <= 760) {
        const navigation = await page.locator('.mobile-nav:visible').boundingBox();
        const details = await footer.locator('.site-footer-details').boundingBox();
        expect((details?.y ?? 0) + (details?.height ?? 0)).toBeLessThanOrEqual(navigation?.y ?? 0);
      }
      await footer.getByRole('link', { name: termsLabel, exact: true }).click();
      await expect(page).toHaveURL(`/${locale}/terms`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        { ko: '이용약관', en: 'Terms of service', ja: '利用規約' }[locale],
      );
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://feedback.example/${locale}/terms`,
      );
      await footer.getByRole('link', { name: privacyLabel, exact: true }).click();
      await expect(page).toHaveURL(`/${locale}/privacy`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        { ko: '개인정보', en: 'Privacy', ja: 'プライバシー' }[locale],
      );
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://feedback.example/${locale}/privacy`,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await footer.locator(`a[href="/${locale}/contact"]`).click();
      await expect(page).toHaveURL(`/${locale}/contact`);
      const article = page.getByRole('article');
      await expect(article.getByRole('link', { name: 'contact@bambyul.com', exact: true })).toHaveAttribute(
        'href',
        'mailto:contact@bambyul.com',
      );
      const support = page.locator('.contact-support:visible');
      await expect(support).toHaveCSS('margin-top', '24px');
      await expect(support).toHaveCSS('margin-bottom', '24px');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
