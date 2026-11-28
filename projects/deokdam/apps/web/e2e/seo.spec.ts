import { expect, test } from '@playwright/test';

import { episodes, episodeShareUrl } from '../src/shared/episodes';
import { siteOrigin } from '../src/shared/site';

test('publishes canonical public URLs and keeps account records out of search and shared previews', async ({
  request,
  page,
}) => {
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain('Sitemap: ' + siteOrigin + '/sitemap.xml');
  const xml = await (await request.get('/sitemap.xml')).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  expect(urls.sort()).toEqual(
    [
      ...['/', '/reading', '/stories', '/shop', '/privacy'].map((path) => siteOrigin + path),
      ...episodes.map((episode) => episodeShareUrl(episode.slug)),
    ].sort(),
  );
  await page.goto('/stories?utm_source=youtube');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', siteOrigin + '/stories');
  await expect(page).toHaveTitle('이야기 속 오늘의 덕 | 덕담집');
  const card = episodes[0];
  if (!card) throw new Error('Expected a published episode');
  await page.goto('/cards/' + card.slug + '?utm_source=youtube');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    'content',
    episodeShareUrl(card.slug),
  );
  const preview = await page.locator('meta[property="og:image"]').getAttribute('content');
  const image = await request.get(new URL(preview!).pathname);
  expect(image.headers()['content-type']).toMatch(/image\/jpeg/);
  await page.goto('/journal');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const privateResponse = await request.get('/api/journal');
  expect(privateResponse.status()).toBe(401);
  expect(privateResponse.headers()['x-robots-tag']).toContain('noindex');
});
