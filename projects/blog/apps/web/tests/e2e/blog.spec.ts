import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import redirects from '../../content/generated-redirects.json' with { type: 'json' };
import imageReplacements from '../../content/image-replacements.json' with { type: 'json' };
import en from '../../messages/en.json' with { type: 'json' };
import ko from '../../messages/ko.json' with { type: 'json' };
import index from '../../src/shared/article/lib/index.json' with { type: 'json' };

const articles = index.filter((article) => article.locale === 'ko');
const article = articles.find((entry) => entry.toc.length > 0) || articles[0]!;
const articlePath = `/ko/blog/${encodeURIComponent(article.slug)}`;

async function expectSelectedTheme(
  page: Page,
  locale: 'ko' | 'en',
  selected: 'light' | 'dark',
  background: string,
) {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', selected);
  await expect.poll(() => html.evaluate((element) => element.style.colorScheme)).toBe(selected);
  await expect(html).toHaveCSS('color-scheme', selected);
  await expect(page.locator('body')).toHaveCSS('background-color', background);
  await expect(page.getByRole('button', { name: (locale === 'ko' ? ko : en).nav.theme })).toHaveAttribute(
    'aria-pressed',
    String(selected === 'dark'),
  );
  await expect.poll(() => page.evaluate(() => localStorage.getItem('blog-theme'))).toBe(selected);
}

test('browse home, search articles, open detail, and visit About', async ({ page }) => {
  await page.goto('/ko');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: ko.nav.blog, exact: true }).click();
  await expect(page).toHaveURL(/\/ko\/blog$/);
  await page.getByRole('combobox', { name: ko.common.search }).fill(article.title);
  await expect(page.locator('.article-list .article-row')).toHaveCount(1);
  await page.getByRole('combobox', { name: ko.common.search }).press('Escape');
  await page.getByRole('link', { name: article.title, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
  await expect(page.locator('.article-prose')).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: ko.nav.about, exact: true }).click();
  await expect(page.getByRole('link', { name: 'contact@bambyul.com' })).toHaveAttribute(
    'href',
    'mailto:contact@bambyul.com',
  );
  await expect(page.getByRole('main')).not.toContainText('경력 타임라인');
});

test('About introduces the author and projects in both locales without horizontal overflow', async ({
  page,
}) => {
  for (const [locale, messages] of [
    ['ko', ko],
    ['en', en],
  ] as const) {
    await page.goto(`/${locale}/about`);
    await expect(page.getByRole('heading', { level: 1, name: messages.about.title })).toBeVisible();
    await expect(page.getByText(messages.about.headline)).toBeVisible();
    await expect(
      page.getByRole('region', { name: messages.about.topics.title }).getByRole('article'),
    ).toHaveCount(3);
    await expect(
      page.getByRole('region', { name: messages.about.projects.title }).getByRole('article'),
    ).toHaveCount(3);
    await expect(page.getByRole('link', { name: messages.about.projects.gameMate.link })).toHaveAttribute(
      'href',
      'https://github.com/jingeon27/side-project/tree/main/projects/game-feedback',
    );
    await expect(page.getByRole('link', { name: 'contact@bambyul.com' })).toHaveAttribute(
      'href',
      'mailto:contact@bambyul.com',
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.getByRole('link', { name: messages.about.readArticles }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/blog$`));
  }
});

test('privacy notice is linked from the footer in both locales', async ({ page }) => {
  for (const [locale, messages] of [
    ['ko', ko],
    ['en', en],
  ] as const) {
    await page.goto(`/${locale}`);
    await page
      .getByRole('contentinfo')
      .getByRole('link', { name: messages.privacy.title, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/privacy$`));
    await expect(page.getByRole('heading', { level: 1, name: messages.privacy.title })).toBeVisible();
    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveCount(
      Object.keys(messages.privacy.sections).length + 2,
    );
  }
});

test('cover and SVG thumbnails load without breaking title links or mobile layout', async ({ page }) => {
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

test('edited article covers load in the body and match the social preview image', async ({ page }) => {
  for (const entry of articles.filter((candidate) => candidate.coverImage)) {
    await page.goto(`/ko/blog/${encodeURIComponent(entry.slug)}`);
    const image = page.locator('.article-prose img').first();
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0))
      .toBe(true);
    const source = new URL((await image.getAttribute('src'))!, page.url());
    expect(source.searchParams.get('url') || source.pathname).toBe(entry.coverImage);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      new RegExp(`${entry.coverImage!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test('product screenshots load and the separate infrastructure article opens in both languages', async ({
  page,
}) => {
  for (const locale of ['ko', 'en'] as const) {
    const entry = index.find(
      (candidate) => candidate.id === 'side-project-design' && candidate.locale === locale,
    )!;
    await page.goto(`/${locale}/blog/${encodeURIComponent(entry.slug)}`);
    await expect(page.getByRole('heading', { level: 1, name: entry.title })).toBeVisible();

    for (const name of ['01-service-screens', '09-product-interactions']) {
      const archived = `/images/posts/side-project-design/${name}.png`;
      const replacement = Object.entries(imageReplacements).find(([original]) => original === archived)?.[1];
      const expected = replacement ?? archived;
      const image = page.locator(`.article-prose img[src*="${expected.split('/').at(-1)}"]`);
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeVisible();
      await expect(image).toHaveAttribute('alt', /\S/);
      await expect
        .poll(() =>
          image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
        )
        .toBe(true);
      const source = new URL((await image.getAttribute('src'))!, page.url());
      expect(source.searchParams.get('url') || source.pathname).toBe(expected);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }

    const infrastructure = index.find(
      (candidate) => candidate.id === 'side-project-infrastructure' && candidate.locale === locale,
    )!;
    await page
      .locator('.article-prose')
      .getByRole('link', { name: infrastructure.title, exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: infrastructure.title })).toBeVisible();
    const productPath = `/${locale}/blog/${encodeURIComponent(entry.slug)}`;
    await expect(page.locator(`.article-prose a[href="${productPath}"]`)).toHaveCount(1);
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
  await expect(search).toBeVisible();
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
  await expect(option).toHaveAttribute('data-highlighted');
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
  for (const [locale, slug] of Object.entries(article.translations))
    await expect(page.locator(`link[rel="alternate"][hreflang="${locale}"]`)).toHaveAttribute(
      'href',
      new RegExp(`/${locale}/blog/${encodeURIComponent(slug)}$`),
    );
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute(
    'href',
    new RegExp(`/rss/${article.locale}$`),
  );
  const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(jsonLd.some((value) => value.includes('BlogPosting') && value.includes('BreadcrumbList'))).toBe(
    true,
  );
});

test('English search opens a full translation and language switching preserves the article', async ({
  page,
}) => {
  const english = index.filter((entry) => entry.locale === 'en');
  const translated = english.find((entry) => entry.id === article.id)!;
  await page.goto('/en/blog');
  await expect(page.locator('.article-list .article-row')).toHaveCount(english.length);
  await page.getByRole('combobox', { name: en.common.search }).fill(translated.title);
  await page.getByRole('combobox', { name: en.common.search }).press('Escape');
  await expect(page.locator('.article-list .article-row')).toHaveCount(1);
  await page.getByRole('link', { name: translated.title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/en/blog/${translated.slug}$`));
  await expect(page.getByRole('heading', { level: 1, name: translated.title })).toBeVisible();
  await expect(page.locator('.article-prose')).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', translated.description);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    new RegExp(`/en/blog/${translated.slug}$`),
  );
  await page.getByRole('button', { name: new RegExp(`^${en.nav.language}:`) }).click();
  await expect(page).toHaveURL(new RegExp(`/ko/blog/${encodeURIComponent(article.slug)}$`));
  await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${ko.nav.language}:`) }).click();
  await expect(page).toHaveURL(new RegExp(`/en/blog/${translated.slug}$`));
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1, name: translated.title })).toBeVisible();
  const firstHeading = translated.toc[0]!;
  const mobileToc = page.locator('.toc-mobile:visible').first();
  if (await mobileToc.count()) await mobileToc.locator('summary').click();
  await page.locator(`a[href="#${firstHeading.id}"]:visible`).first().click();
  await expect(page.locator('.article-prose').locator(`[id="${firstHeading.id}"]`)).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash.slice(1))).toBe(firstHeading.id);
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

for (const { system, selected } of [
  { system: 'light', selected: 'dark' },
  { system: 'dark', selected: 'light' },
] as const) {
  test(`the selected ${selected} theme survives language navigation with an OS ${system} preference`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: system });
    await page.goto('/ko');
    await expect(page.locator('html')).toHaveAttribute('data-theme', system);
    const themeSwitch = page.getByRole('button', { name: ko.nav.theme });
    await expect(themeSwitch).toHaveAttribute('aria-pressed', String(system === 'dark'));
    await themeSwitch.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', selected);
    const background = await page
      .locator('body')
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    await expectSelectedTheme(page, 'ko', selected, background);

    for (const suffix of ['', '/blog', '/about']) {
      if (suffix) {
        await page
          .getByRole('navigation')
          .getByRole('link', {
            name: suffix === '/blog' ? ko.nav.blog : ko.nav.about,
            exact: true,
          })
          .click();
        await expect(page).toHaveURL(new RegExp(`/ko${suffix}$`));
        await expectSelectedTheme(page, 'ko', selected, background);
      }
      for (const [from, to] of [
        ['ko', 'en'],
        ['en', 'ko'],
      ] as const) {
        await page
          .getByRole('button', {
            name: new RegExp(`^${(from === 'ko' ? ko : en).nav.language}:`),
          })
          .click();
        await expect(page).toHaveURL(new RegExp(`/${to}${suffix}$`));
        await expect(page.locator('html')).toHaveAttribute('lang', to);
        await expectSelectedTheme(page, to, selected, background);
      }
    }

    const translated = index.find((entry) => entry.locale === 'en' && entry.id === article.id)!;
    await page.goto(articlePath);
    await expectSelectedTheme(page, 'ko', selected, background);
    await page.getByRole('button', { name: new RegExp(`^${ko.nav.language}:`) }).click();
    await expect(page).toHaveURL(new RegExp(`/en/blog/${translated.slug}$`));
    await expectSelectedTheme(page, 'en', selected, background);
    await page.getByRole('button', { name: new RegExp(`^${en.nav.language}:`) }).click();
    await expect(page).toHaveURL(new RegExp(`/ko/blog/${encodeURIComponent(article.slug)}$`));
    await expectSelectedTheme(page, 'ko', selected, background);

    const untranslated = articles.find((entry) => !('en' in entry.translations));
    if (untranslated) {
      await page.getByRole('navigation').getByRole('link', { name: ko.nav.blog, exact: true }).click();
      await expect(page).toHaveURL(/\/ko\/blog$/);
      await page.getByRole('link', { name: untranslated.title, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${encodeURIComponent(untranslated.slug)}$`));
      await page.getByRole('button', { name: new RegExp(`^${ko.nav.language}:`) }).click();
      await expect(page.getByRole('status')).toContainText(ko.common.translationMissing);
      await expectSelectedTheme(page, 'ko', selected, background);
      await page.getByRole('link', { name: ko.common.translationList, exact: true }).click();
      await expect(page).toHaveURL(/\/en\/blog$/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expectSelectedTheme(page, 'en', selected, background);
      await page.getByRole('button', { name: new RegExp(`^${en.nav.language}:`) }).click();
      await expect(page).toHaveURL(/\/ko\/blog$/);
      await expectSelectedTheme(page, 'ko', selected, background);
    }
  });
}

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

test('sitemap and robots expose published translations and allow rendering assets', async ({
  page,
  request,
}) => {
  const response = await request.get('/sitemap.xml', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/xml');
  const sitemap = await page.evaluate(
    (xml) => {
      const document = new DOMParser().parseFromString(xml, 'application/xml');
      const namespace = 'http://www.sitemaps.org/schemas/sitemap/0.9';
      return {
        errors: document.getElementsByTagName('parsererror').length,
        namespace: document.documentElement.namespaceURI,
        entries: Array.from(document.getElementsByTagNameNS(namespace, 'url'), (entry) => ({
          url: entry.getElementsByTagNameNS(namespace, 'loc')[0]?.textContent || '',
          lastModified: entry.getElementsByTagNameNS(namespace, 'lastmod')[0]?.textContent,
          languages: Object.fromEntries(
            Array.from(entry.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'link'), (link) => [
              link.getAttribute('hreflang'),
              link.getAttribute('href'),
            ]),
          ),
        })),
      };
    },
    await response.text(),
  );
  expect(sitemap.errors).toBe(0);
  expect(sitemap.namespace).toBe('http://www.sitemaps.org/schemas/sitemap/0.9');
  const urls = sitemap.entries.map((entry) => entry.url);
  expect(new Set(urls).size).toBe(urls.length);
  const origin = new URL(urls[0]!).origin;
  const articleUrl = (entry: (typeof index)[number]) =>
    `${origin}/${entry.locale}/blog/${encodeURIComponent(entry.slug)}`;
  expect(urls.filter((url) => /\/(ko|en)\/blog\/[^/]+$/.test(url)).sort()).toEqual(
    index.map(articleUrl).sort(),
  );
  for (const article of index) {
    const entry = sitemap.entries.find((entry) => entry.url === articleUrl(article))!;
    expect(entry.lastModified).toBe(article.updatedAt || article.publishedAt);
    const translations = index.filter((translation) => translation.id === article.id);
    const korean = translations.find((translation) => translation.locale === 'ko');
    expect(entry.languages).toEqual({
      ...Object.fromEntries(translations.map((translation) => [translation.locale, articleUrl(translation)])),
      ...(korean && translations.length > 1 ? { 'x-default': articleUrl(korean) } : {}),
    });
  }
  const robots = await request.get('/robots.txt', { maxRedirects: 0 });
  expect(robots.status()).toBe(200);
  expect(robots.headers()['content-type']).toContain('text/plain');
  const rules = await robots.text();
  expect(rules).toMatch(/^User-Agent: \*$/m);
  expect(rules).toMatch(/^Allow: \/$/m);
  expect(rules).toContain(`Sitemap: ${origin}/sitemap.xml`);
  const blockedPaths = [...rules.matchAll(/^Disallow:\s*(\S+)$/gm)].map((match) => match[1]!);
  expect(blockedPaths).toContain('/api/');
  for (const path of [
    ...urls.map((url) => new URL(url).pathname),
    '/_next/static/chunks/app.js',
    '/_next/static/css/app.css',
    '/_next/image',
    '/images/thumbnails/reading-ai-code.svg',
  ])
    expect(
      blockedPaths.some((blocked) => path.startsWith(blocked)),
      path,
    ).toBe(false);
});

test('both feeds and OG images are publicly readable', async ({ request }) => {
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
  const englishImage = await request.get(`/og/en/${article.id}`);
  expect(englishImage.ok()).toBe(true);
  expect(englishImage.headers()['content-type']).toContain('image/png');
  expect((await request.get('/og/en/missing-article')).status()).toBe(404);
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
  for (const entry of index) {
    const response = await request.get(`/${entry.locale}/blog/${encodeURIComponent(entry.slug)}`);
    expect(response.status(), `${entry.id}/${entry.locale}`).toBe(200);
    expect(await response.text(), `${entry.id}/${entry.locale}`).toContain('<article class="article-prose">');
  }
});

test('URL filters survive reload and browser history navigation', async ({ page }) => {
  await page.goto('/ko/blog?q=react&category=til&ref=mail#archive');
  const search = page.getByRole('combobox', { name: ko.common.search });
  const filters = page.getByRole('group', { name: ko.common.category });
  const all = filters.getByRole('button', { name: new RegExp(ko.common.all) });
  const til = filters.getByRole('button', { name: /TIL/ });
  await expect(search).toHaveValue('react');
  await expect(til).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(search).toHaveValue('react');
  await expect(til).toHaveAttribute('aria-pressed', 'true');
  await all.click();
  await expect.poll(() => new URL(page.url()).searchParams.has('category')).toBe(false);
  await page.goBack();
  await expect(til).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await search.fill('캐시');
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('캐시');
  await expect(search).toHaveValue('캐시');
  await search.press('Escape');
  await page.getByRole('button', { name: ko.common.clearFilters }).first().click();
  const url = new URL(page.url());
  expect(url.searchParams.has('q')).toBe(false);
  expect(url.searchParams.get('ref')).toBe('mail');
  expect(url.hash).toBe('#archive');
  await expect(search).toHaveValue('');

  await page.goto('/ko/blog?q=react&category=unknown&ref=mail&ref=sidebar#archive');
  await expect(search).toHaveValue('react');
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.article-list > article').first()).toBeVisible();
  await til.click();
  await expect(search).toHaveValue('react');
  await expect(til).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: ko.common.clearFilters }).first().click();
  const preserved = new URL(page.url());
  expect(preserved.searchParams.getAll('ref')).toEqual(['mail', 'sidebar']);
  expect(preserved.searchParams.has('q')).toBe(false);
  expect(preserved.searchParams.has('category')).toBe(false);
  expect(preserved.hash).toBe('#archive');

  await page.goto('/ko/blog/category/engineering?category=til&q=react');
  await expect(page.getByRole('group', { name: ko.common.category })).toHaveCount(0);
  await expect(search).toHaveValue('react');
});

test('search popup dismisses through outside click and Tab without clearing the URL query', async ({
  page,
}) => {
  await page.goto('/ko/blog');
  const search = page.getByRole('combobox', { name: ko.common.search });
  await search.fill('react');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.getByRole('heading', { level: 1, includeHidden: true }).click();
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(search).toHaveValue('react');
  expect(new URL(page.url()).searchParams.get('q')).toBe('react');
  await search.click();
  await search.press('Tab');
  await expect(page.getByRole('button', { name: ko.common.clear })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(search).toHaveValue('react');
});
