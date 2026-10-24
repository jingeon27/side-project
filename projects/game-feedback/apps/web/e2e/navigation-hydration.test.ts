import { expect, test } from '@playwright/test';

for (const width of [390, 1280]) {
  test(`game navigation is present in the initial HTML at ${width}px`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      userAgent: 'bingbot',
      viewport: { width, height: 844 },
    });
    try {
      const page = await context.newPage();
      for (const path of [
        '/ko',
        '/ko/boards/feedback',
        '/ko/boards/friend-sale',
        '/ko/boards/friendly',
        '/ko/boards/coaching',
        '/ko/boards/free',
        '/en',
        '/ja/boards/free',
      ]) {
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        // Next streams this Suspense boundary outside <main> before its inline script inserts it.
        expect(await response?.text()).toContain('class="game-board-navigation"');
        const navigation = page.locator('.game-board-navigation');
        await expect(navigation).toHaveCount(1);
        await expect(navigation.locator('a')).toHaveCount(6);
        await expect(navigation.locator('[aria-current="page"]')).toHaveAttribute('href', path);
      }
    } finally {
      await context.close();
    }
  });

  test(`cold loads, reloads and board changes hydrate without errors at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (/hydrat|server rendered|Minified React error #(418|423|425)/i.test(message.text())) {
        errors.push(message.text());
      }
    });
    for (const locale of ['ko', 'en', 'ja']) {
      await page.goto(`/${locale}`);
      const navigation = page.locator('main:visible .game-board-navigation');
      const links = width < 760 ? navigation : page.locator('.left-sidebar:visible');
      await expect(navigation.locator('[aria-current="page"]')).toHaveAttribute('href', `/${locale}`);
      await links.locator(`a[href="/${locale}/boards/free"]`).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/boards/free$`));
      await expect(navigation.locator('[aria-current="page"]')).toHaveAttribute(
        'href',
        `/${locale}/boards/free`,
      );
      await page.reload();
      await expect(navigation.locator('[aria-current="page"]')).toHaveAttribute(
        'href',
        `/${locale}/boards/free`,
      );
      await links.locator(`a[href="/${locale}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}$`));
      await expect(navigation.locator('[aria-current="page"]')).toHaveAttribute('href', `/${locale}`);
    }
    expect(errors).toEqual([]);
  });
}
