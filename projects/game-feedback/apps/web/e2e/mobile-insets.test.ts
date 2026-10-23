import { expect, test } from '@playwright/test';

for (const width of [320, 393, 430, 760]) {
  test(`${width}px 전체 화면의 본문·상단바·하단 안내는 좌우 여백을 맞춰야 한다`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/ko', '/ko/guide', '/ko/settings']) {
      await page.goto(path);
      const main = page.getByRole('main');
      await expect(main).toBeVisible();
      const bounds = await page.evaluate(() => {
        const content = document.querySelector('.site-grid > main');
        const header = document.querySelector('.topbar-inner');
        const footer = document.querySelector('.site-footer-inner');
        if (!content || !header || !footer) throw new Error('화면 영역을 찾을 수 없습니다.');
        const main = content.getBoundingClientRect();
        const inset = (element: Element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            left: rect.left + Number.parseFloat(style.paddingLeft),
            right: document.documentElement.clientWidth - rect.right + Number.parseFloat(style.paddingRight),
          };
        };
        return {
          main: { left: main.left, right: document.documentElement.clientWidth - main.right },
          header: inset(header),
          footer: inset(footer),
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      expect(bounds.main.left, path).toBeGreaterThanOrEqual(16);
      expect(bounds.main.right, path).toBeGreaterThanOrEqual(16);
      expect(Math.abs(bounds.main.left - bounds.main.right), path).toBeLessThanOrEqual(1);
      for (const region of [bounds.header, bounds.footer]) {
        expect(Math.abs(region.left - bounds.main.left), path).toBeLessThanOrEqual(1);
        expect(Math.abs(region.right - bounds.main.right), path).toBeLessThanOrEqual(1);
      }
      expect(bounds.scrollWidth, path).toBeLessThanOrEqual(bounds.width);
    }
    await page.screenshot({ path: testInfo.outputPath(`page-insets-${width}.png`), animations: 'disabled' });
  });
}
