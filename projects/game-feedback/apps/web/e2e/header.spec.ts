import { test, expect } from '@playwright/test';

for (const width of [320, 1440]) {
  test(`the header stays accessible while scrolling and keeps anchor targets visible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/ko/guide');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const header = page.getByRole('banner');
    await expect.poll(async () => (await header.boundingBox())?.y).toBe(0);
    await expect(header.getByRole('combobox', { name: '언어 설정', exact: true })).toBeInViewport({
      ratio: 1,
    });
    expect(
      await header.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(box.width / 2, box.height / 2));
      }),
    ).toBe(true);
    await header.getByRole('combobox', { name: '언어 설정', exact: true }).click();
    await page.getByRole('option', { name: 'English', exact: true }).click();
    await expect(page).toHaveURL('/en/guide');
    await expect.poll(async () => (await header.boundingBox())?.y).toBe(0);
    await page.goto('/en/settings#language');
    const language = page.locator('#language-preference');
    await expect(language).toBeInViewport({ ratio: 1 });
    expect((await language.boundingBox())?.y).toBeGreaterThanOrEqual(
      (await header.boundingBox())?.height ?? 0,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
