import { expect, test } from './support/test';

for (const width of [320, 1440]) {
  test(`service footer opens localized policy pages and stays above mobile navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const [locale, termsLabel, privacyLabel, aboutLabel] of [
      ['ko', '서비스 이용약관', '개인정보 처리방침', '서비스 소개'],
      ['en', 'Terms of service', 'Privacy policy', 'About Game Mate'],
      ['ja', '利用規約', 'プライバシーポリシー', 'Game Mateについて'],
    ] as const) {
      await page.goto(`/${locale}/guide`);
      const footer = page.getByRole('contentinfo');
      await expect(footer).toHaveCount(1);
      await expect(footer.locator('nav').getByRole('link')).toHaveCount(5);
      await expect(footer.getByRole('link', { name: aboutLabel, exact: true })).toHaveAttribute(
        'href',
        '/about',
      );
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
      await footer.getByRole('link', { name: aboutLabel, exact: true }).click();
      await expect(page).toHaveURL('/about');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('혼자 막힌 플레이');
    }
  });
}
