import { test, expect } from '@playwright/test';

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
      await expect(footer.getByRole('link')).toHaveCount(3);
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
        const navigation = await page.locator('.mobile-nav').boundingBox();
        const links = await footer.locator('nav').boundingBox();
        expect((links?.y ?? 0) + (links?.height ?? 0)).toBeLessThanOrEqual(navigation?.y ?? 0);
      }
      await footer.getByRole('link', { name: termsLabel, exact: true }).click();
      await expect(page).toHaveURL(`/${locale}/terms`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('이용약관');
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://feedback.example/ko/terms',
      );
      await footer.getByRole('link', { name: privacyLabel, exact: true }).click();
      await expect(page).toHaveURL(`/${locale}/privacy`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('개인정보');
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://feedback.example/ko/privacy',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
