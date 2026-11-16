import type { BrowserContext, Page } from 'playwright';
import sharp from 'sharp';
import { expect, it, vi } from 'vitest';

import { CounterpushBrowser } from './browser.ts';

it('captures the same normalized arena clip and falls back when it leaves the viewport', async () => {
  const image = await sharp({ create: { width: 368, height: 652, channels: 3, background: '#223344' } })
    .png()
    .toBuffer();
  const surface = {
    boundingBox: vi.fn(async () => ({ x: 10, y: 20, width: 368, height: 652 })),
    screenshot: vi.fn(async () => image),
  };
  const page = {
    locator: () => surface,
    viewportSize: () => ({ width: 1100, height: 940 }),
    screenshot: vi.fn(async () => image),
  };
  const browser = new CounterpushBrowser({} as BrowserContext, page as unknown as Page);
  const fast = await browser.capture(true);
  expect(page.screenshot).toHaveBeenCalledWith({
    type: 'png',
    clip: { x: 10, y: 20, width: 368, height: 652 },
    timeout: 5000,
  });
  expect((await sharp(fast.image).metadata()).width).toBe(368);
  surface.boundingBox.mockResolvedValueOnce({ x: -1, y: 20, width: 368, height: 652 });
  await browser.capture(true);
  expect(surface.screenshot).toHaveBeenCalledOnce();
});
