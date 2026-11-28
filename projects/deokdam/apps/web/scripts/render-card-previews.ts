import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { episodes } from '../src/shared/episodes.ts';

const output = new URL('../public/images/cards/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(new URL('./card-preview.html', import.meta.url).href);
  for (const episode of episodes) {
    await page.evaluate(async ({ title, message, image }) => {
      const scene = document.querySelector<HTMLImageElement>('.scene');
      const header = document.querySelector('header');
      const blockquote = document.querySelector('blockquote');
      const footer = document.querySelector('footer');
      if (!scene || !header || !blockquote || !footer) throw new Error('Incomplete card preview template');
      scene.hidden = !image;
      if (image) {
        scene.src = '../public' + image;
        await scene.decode();
      }
      blockquote.textContent = message;
      footer.textContent = title;
      await document.fonts.ready;
      const brand = header.getBoundingClientRect();
      const quote = blockquote.getBoundingClientRect();
      const credit = footer.getBoundingClientRect();
      if (brand.bottom >= quote.top || quote.bottom >= credit.top || credit.bottom > innerHeight) {
        throw new Error(`공유 이미지에 문장이 다 들어가지 않습니다: ${title}`);
      }
    }, episode);
    await page.screenshot({
      path: fileURLToPath(new URL(episode.slug + '.jpg', output)),
      type: 'jpeg',
      quality: 90,
    });
  }
} finally {
  await browser.close();
}
