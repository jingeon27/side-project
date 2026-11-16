import { expect, test } from '@playwright/test';

import ko from '../../messages/ko.json' with { type: 'json' };
import articles from '../../src/shared/article/lib/index.json' with { type: 'json' };

const article = articles.find((entry) => entry.id === 'side-project-design' && entry.locale === 'ko');
if (!article) throw new Error('The header test needs a long published article.');
const articlePath = `/ko/blog/${encodeURIComponent(article.slug)}`;

test('header follows scroll direction without moving the article layout', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(articlePath);
  const header = page.getByRole('banner', { includeHidden: true });
  const main = page.getByRole('main');
  const documentTop = () => main.evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
  const initialTop = await documentTop();
  const initialHeight = (await header.boundingBox())?.height;
  await expect(header).toBeVisible();
  await page.mouse.move(12, 300);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await expect(header).toHaveAttribute('data-scroll-hidden', 'true');
  await expect(header).toHaveAttribute('inert', '');
  await expect(header).toBeHidden();
  expect(await documentTop()).toBe(initialTop);
  expect(await header.evaluate((node: HTMLElement) => node.offsetHeight)).toBe(initialHeight);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.screenshot({ path: testInfo.outputPath('header-down.png') });
  await page.mouse.wheel(0, -48);
  await expect(header).not.toHaveAttribute('data-scroll-hidden');
  await expect(header).toBeVisible();
  await expect(header).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  expect(await documentTop()).toBe(initialTop);
  await page.screenshot({ path: testInfo.outputPath('header-up.png') });
  await page.mouse.wheel(0, -1_000);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(8);
  await expect(header).not.toHaveAttribute('inert');
  await expect(header).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

test('focused header controls follow the same direction rule and hidden controls leave the tab order', async ({
  page,
}) => {
  await page.goto(articlePath);
  const header = page.getByRole('banner', { includeHidden: true });
  const blog = header.getByRole('link', { name: ko.nav.blog, exact: true });
  await blog.focus();
  await expect(blog).toBeFocused();
  await page.mouse.move(12, 300);
  await page.mouse.wheel(0, 500);
  await expect(header).toHaveAttribute('inert', '');
  await expect(header).toBeHidden();
  for (const key of ['Tab', 'Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    expect(await header.evaluate((node) => node.contains(document.activeElement))).toBe(false);
  }
  await page.mouse.move(12, 300);
  await page.mouse.wheel(0, -80);
  await expect(header).not.toHaveAttribute('inert');
  await expect(header).toBeVisible();
  expect(
    await header.evaluate((node) =>
      Math.max(...getComputedStyle(node).transitionDuration.split(',').map(parseFloat)),
    ),
  ).toBeLessThanOrEqual(0.01);
  await blog.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/ko/blog');
  await expect(header).toBeVisible();
});

test('server-rendered header navigation remains visible without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/ko');
    const header = page.getByRole('banner', { includeHidden: true });
    await expect(header).toBeVisible();
    await expect(header).not.toHaveAttribute('inert');
    await header.getByRole('link', { name: ko.nav.blog, exact: true }).click();
    await expect(page).toHaveURL('/ko/blog');
  } finally {
    await context.close();
  }
});
