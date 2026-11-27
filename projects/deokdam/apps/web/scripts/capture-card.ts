import { chromium } from '@playwright/test';

import { episodePath, findEpisode } from '../src/content/episodes.ts';

const [slug, origin, output] = process.argv.slice(2);
if (!slug || !origin || !output) throw new Error('Usage: capture-card <episode> <web-origin> <image-path>');
const episode = findEpisode(slug);
if (!episode) throw new Error('Unknown web episode');

const url = new URL(episodePath(slug), origin);
if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) {
  throw new Error('Use an HTTPS site or the loopback preview');
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'ko-KR',
  });
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort(),
  );
  const response = await page.goto(url.href);
  if (!response?.ok()) throw new Error('Could not open episode card');
  const card = page.locator('[data-short-card]');
  const action = await card.getByRole('heading').textContent();
  if (action?.trim() !== episode.action) throw new Error('Published card copy differs from the episode');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await card.screenshot({ path: output, animations: 'disabled' });
} finally {
  await browser.close();
}
