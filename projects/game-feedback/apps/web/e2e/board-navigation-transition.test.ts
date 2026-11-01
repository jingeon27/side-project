import { expect, test } from './support/test';

test.use({ video: 'on' });

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`게시판 이동은 칩의 위치와 선명도를 유지해야 한다 (${reducedMotion})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko');
    await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);
    const navigation = page.locator('.game-board-navigation:visible');
    const chips = navigation.locator('.game-board-chips');
    await chips.hover();
    await page.mouse.wheel(160, 0);
    await expect.poll(() => chips.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    const free = navigation.getByRole('link', { name: '자유게시판', exact: true });
    await expect(free).toBeInViewport({ ratio: 1 });
    const before = await chips.evaluate((element) => ({
      left: element.scrollLeft,
      top: element.getBoundingClientRect().top,
    }));
    const framesPromise = page.evaluate(
      (targetPath) =>
        new Promise<Array<{ path: string; time: number; left: number; top: number; opacity: number }>>(
          (resolve) => {
            const started = performance.now();
            const frames: Array<{
              path: string;
              time: number;
              left: number;
              top: number;
              opacity: number;
            }> = [];
            const sample = () => {
              const container = Array.from(document.querySelectorAll('.game-board-chips')).find((element) =>
                element.checkVisibility(),
              );
              if (container) {
                const ancestors = (element: Element | null): Element[] =>
                  element ? [element, ...ancestors(element.parentElement)] : [];
                const opacity = ancestors(container).reduce(
                  (value, element) => value * Number.parseFloat(getComputedStyle(element).opacity),
                  1,
                );
                frames.push({
                  path: location.pathname,
                  time: performance.now() - started,
                  left: container.scrollLeft,
                  top: container.getBoundingClientRect().top,
                  opacity,
                });
              }
              const firstAfter = frames.find((frame) => frame.path === targetPath);
              if (
                (firstAfter && performance.now() - started - firstAfter.time >= 400) ||
                performance.now() - started > 15_000
              ) {
                resolve(frames);
                return;
              }
              requestAnimationFrame(sample);
            };
            sample();
          },
        ),
      '/ko/boards/free',
    );
    await free.click();
    await expect(page).toHaveURL('/ko/boards/free');
    await expect(
      page.getByRole('banner').getByRole('heading', { name: '자유게시판', exact: true }),
    ).toBeVisible();
    const frames = await framesPromise;
    await testInfo.attach('chip-transition-frames', {
      body: JSON.stringify({ before, frames }),
      contentType: 'application/json',
    });
    await page.screenshot({ path: testInfo.outputPath('board-transition.png') });
    const after = frames.filter((frame) => frame.path === '/ko/boards/free');
    expect(after.length).toBeGreaterThan(0);
    expect(Math.min(...after.map((frame) => frame.opacity))).toBe(1);
    expect(Math.max(...after.map((frame) => Math.abs(frame.left - before.left)))).toBeLessThanOrEqual(1);
    expect(Math.max(...after.map((frame) => Math.abs(frame.top - before.top)))).toBeLessThanOrEqual(1);
    await expect(navigation.getByRole('link', { name: '자유게시판', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
