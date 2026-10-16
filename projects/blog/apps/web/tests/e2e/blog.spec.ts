import { test, expect } from '@playwright/test';
import index from '../../src/entities/article/lib/index.json' with { type: 'json' };
import ko from '../../messages/ko.json' with { type: 'json' };
import en from '../../messages/en.json' with { type: 'json' };
import redirects from '../../content/generated-redirects.json' with { type: 'json' };
import { readFileSync } from 'node:fs';

const articles = index.filter((article) => article.locale === 'ko');
const article = articles.find((entry) => entry.toc.length > 0) || articles[0]!;
const articlePath = `/ko/blog/${encodeURIComponent(article.slug)}`;

test('browse home, search articles, open detail, and visit About', async ({ page }) => {
  await page.goto('/ko');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: ko.nav.blog, exact: true }).click();
  await expect(page).toHaveURL(/\/ko\/blog$/);
  await page.getByRole('combobox', { name: ko.common.search }).fill(article.title);
  await expect(page.locator('.article-list .article-row')).toHaveCount(1);
  await page.getByRole('link', { name: article.title, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
  await expect(page.locator('.article-prose')).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: ko.nav.about, exact: true }).click();
  await expect(page.getByRole('link', { name: 'jingeon27@gmail.com' })).toHaveAttribute(
    'href',
    'mailto:jingeon27@gmail.com',
  );
  await expect(page.getByRole('main')).not.toContainText('경력 타임라인');
});

test('cover, article diagram, and fallback thumbnails load without breaking title links or mobile layout', async ({
  page,
}) => {
  await page.goto('/ko/blog');
  const search = page.getByRole('combobox', { name: ko.common.search });
  for (const id of ['reading-ai-code', 'health-check-program', 'bottom-sheet-drag-crash']) {
    const entry = articles.find((candidate) => candidate.id === id)!;
    expect(entry, id).toBeDefined();
    await search.fill(entry.title);
    await search.press('Escape');
    await expect(search).toHaveAttribute('aria-expanded', 'false');
    const row = page.locator('.article-list .article-row');
    await expect(row).toHaveCount(1);
    const image = row.locator('img');
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0))
      .toBe(true);
    const title = row.locator('h3').getByRole('link', { name: entry.title, exact: true });
    await expect(title).toBeVisible();
    expect(decodeURIComponent((await title.getAttribute('href'))!)).toBe(`/ko/blog/${entry.slug}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test('unified suggestions apply an exact tag without requiring it in the title', async ({ page }) => {
  await page.goto('/ko/blog');
  const search = page.getByRole('combobox', { name: ko.common.search });
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await search.click();
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('option', { name: /^#/ })).toHaveCount(0);

  const tag = 'react';
  const partialMatches = articles.filter(
    (entry) => entry.title.toLowerCase().includes(tag) || entry.tags.some((value) => value.includes(tag)),
  );
  const exactMatches = articles.filter((entry) => entry.tags.includes(tag));
  expect(exactMatches.some((entry) => !entry.title.toLowerCase().includes(tag))).toBe(true);
  await search.fill('ReAcT');
  await expect(page.locator('.article-list .article-row')).toHaveCount(partialMatches.length);
  const suggestions = page.getByRole('listbox');
  const bounds = await suggestions.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('option', { name: '#react', exact: true }).click();
  await expect(search).toHaveValue('#react');
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.locator('.article-list .article-row')).toHaveCount(exactMatches.length);
  for (const match of exactMatches) {
    await expect(page.getByRole('link', { name: match.title, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: ko.common.clear, exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('.article-list .article-row')).toHaveCount(articles.length);
});

test('Command and Control shortcuts open search, Escape closes it, and Enter opens an article', async ({
  page,
}) => {
  await page.goto('/ko/blog');
  const search = page.getByRole('combobox', { name: ko.common.search });
  for (const shortcut of ['Meta+k', 'Control+k']) {
    await page.keyboard.press(shortcut);
    await expect(search).toBeFocused();
    await expect(search).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(search).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('listbox')).toHaveCount(0);
  }
  await search.fill(article.title);
  const option = page.getByRole('option', { name: article.title, exact: true });
  await expect(option).toBeVisible();
  await search.press('ArrowDown');
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await search.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${encodeURIComponent(article.slug)}$`));
  await expect(page.getByRole('heading', { name: article.title, level: 1 })).toBeVisible();
});

test('category and tag routes only show matching content', async ({ page }) => {
  await page.goto(`/ko/blog/category/${article.category}`);
  await expect(page.locator('.article-list .article-row')).toHaveCount(
    articles.filter((entry) => entry.category === article.category).length,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    new RegExp(`/ko/blog/category/${article.category}$`),
  );
  const unicodeTag = articles.flatMap((entry) => entry.tags).find((tag) => /[^\x00-\x7F]/.test(tag));
  for (const tag of new Set([article.tags[0], unicodeTag].filter((tag): tag is string => Boolean(tag)))) {
    await page.goto(`/ko/blog/tag/${encodeURIComponent(tag)}`);
    await expect(page.locator('.article-list .article-row')).toHaveCount(
      articles.filter((entry) => entry.tags.includes(tag)).length,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`/ko/blog/tag/${encodeURIComponent(tag)}$`),
    );
  }
});

test('article SEO matches canonical, language availability, and structured data', async ({ page }) => {
  await page.goto(articlePath);
  await expect(page).toHaveTitle(new RegExp(article.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    new RegExp(`${encodeURIComponent(article.slug)}$`),
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', article.title);
  const expectedImage = article.coverImage || `/og/${article.locale}/${article.id}`;
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    new RegExp(`${expectedImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', article.description);
  if (!('en' in article.translations))
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(0);
  const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(jsonLd.some((value) => value.includes('BlogPosting') && value.includes('BreadcrumbList'))).toBe(
    true,
  );
});

test('an unavailable translation has an explicit notice and target language list', async ({ page }) => {
  const untranslated = articles.find((entry) => !('en' in entry.translations));
  test.skip(!untranslated, 'All published posts have an English translation.');
  await page.goto(`/ko/blog/${encodeURIComponent(untranslated!.slug)}`);
  await page.getByRole('button', { name: /언어 변경/ }).click();
  await expect(page.getByRole('status')).toContainText(ko.common.translationMissing);
  await page.getByRole('link', { name: ko.common.translationList }).click();
  await expect(page).toHaveURL(/\/en\/blog$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  if (!index.some((entry) => entry.locale === 'en'))
    await expect(page.getByRole('heading', { name: en.common.empty })).toBeVisible();
});

test('TOC links target the real heading and update the URL fragment', async ({ page }) => {
  await page.goto(articlePath);
  const entry = article.toc[0]!;
  const mobileToc = page.locator('.toc-mobile:visible').first();
  if (await mobileToc.count()) await mobileToc.locator('summary').click();
  const link = page.locator(`a[href="#${entry.id}"]:visible`).first();
  await link.click();
  await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash.slice(1)))).toBe(entry.id);
  const heading = page.locator('.article-prose').locator(`[id="${entry.id}"]`);
  await expect(heading).toBeVisible();
  await expect(link).toHaveAttribute('aria-current', 'location');
  await expect.poll(async () => (await heading.boundingBox())!.y).toBeLessThan(page.viewportSize()!.height);
});

test('code copy preserves all code lines and code scrolls within the article', async ({ page, context }) => {
  const source = articles
    .map((entry) => ({
      article: entry,
      mdx: readFileSync(new URL(`../../content/posts/${entry.id}/ko.mdx`, import.meta.url), 'utf8'),
    }))
    .find((entry) => /^```[^\n]*\n[\s\S]*?^```/m.test(entry.mdx));
  test.skip(!source, 'No published code blocks.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`/ko/blog/${encodeURIComponent(source!.article.slug)}`);
  const block = page.locator('.code-block').first();
  const expected = source!.mdx.match(/^```[^\n]*\n([\s\S]*?)^```/m)![1]!;
  const code = await block.locator('pre code').textContent();
  // Compare with the original source, independently of highlighted token markup.
  expect(code).toBeTruthy();
  await block.getByRole('button', { name: ko.article.copyCode }).click();
  await expect(block.getByRole('status')).toContainText(ko.article.copied);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  const dimensions = await block.locator('pre').evaluate((element) => {
    const before = element.scrollLeft;
    element.scrollLeft = element.scrollWidth;
    return {
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      moved: element.scrollLeft > before,
      overflow: getComputedStyle(element).overflowX,
    };
  });
  expect(['auto', 'scroll']).toContain(dimensions.overflow);
  if (dimensions.scrollWidth > dimensions.width) expect(dimensions.moved).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('legacy numeric Tistory paths return an explicit 301 to the matching article', async ({ request }) => {
  const legacy = redirects.find((entry) => entry.source === '/35')!;
  const response = await request.get(legacy.source, { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(decodeURI(new URL(response.headers().location!, 'http://127.0.0.1:3101').pathname)).toBe(
    legacy.destination,
  );
});

test('theme persists and the layout stays inside the viewport', async ({ page }) => {
  await page.goto(articlePath);
  const theme = page.getByRole('button', { name: ko.nav.theme });
  await theme.click();
  const chosen = await page.locator('html').getAttribute('data-theme');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', chosen!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const headings = page.locator('.article-prose h2[id], .article-prose h3[id]');
  if (await headings.count()) {
    const headingId = await headings.first().getAttribute('id');
    expect(article.toc.some((entry) => entry.id === headingId)).toBe(true);
  }
});

test('unknown pages, slugs, categories, tags and unsupported locales return 404', async ({ request }) => {
  for (const path of [
    '/ko/blog/definitely-missing-article',
    '/ko/blog/category/not-a-category',
    '/ko/blog/tag/not-a-real-tag',
    '/xx/blog',
    '/ko/does-not-exist',
    '/ko/blog/%25',
    '/ko/blog/tag/%25',
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});

test('sitemap, robots, both feeds and OG image are publicly readable', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain(encodeURIComponent(article.slug));
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain('Sitemap:');
  for (const locale of ['ko', 'en']) {
    const response = await request.get(`/rss/${locale}`);
    expect(response.headers()['content-type']).toContain('application/rss+xml');
    const xml = await response.text();
    expect(xml).toContain(`<language>${locale}</language>`);
    if (locale === 'en' && !index.some((entry) => entry.locale === 'en')) expect(xml).not.toContain('<item>');
  }
  const image = await request.get('/opengraph-image');
  expect(image.ok()).toBe(true);
  expect(image.headers()['content-type']).toContain('image/png');
  const articleImage = await request.get(`/og/ko/${article.id}`);
  expect(articleImage.ok()).toBe(true);
  expect(articleImage.headers()['content-type']).toContain('image/png');
  expect((await request.get(`/og/en/${article.id}`)).status()).toBe(404);
  expect((await request.get('/rss/fr')).status()).toBe(404);
});

test('keyboard users can skip navigation to the main content', async ({ page }) => {
  await page.goto('/ko');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: ko.nav.skip });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main-content$/);
});

test('every published article serves its complete reading page', async ({ request }) => {
  for (const entry of articles) {
    const response = await request.get(`/ko/blog/${encodeURIComponent(entry.slug)}`);
    expect(response.status(), entry.id).toBe(200);
    expect(await response.text(), entry.id).toContain('<article class="article-prose">');
  }
});
