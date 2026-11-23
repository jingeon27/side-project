import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const preview = process.argv[2] ?? 'http://127.0.0.1:43719';
const directory = fileURLToPath(new URL('../../../production/.work/browser-capture/', import.meta.url));
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', (error) => console.error(error.message));
  await page.goto(preview + '/capture.html');
  await page.waitForFunction(() => typeof window.drawFrame === 'function');

  async function write(name, shot, width, height, mode, position = 0.85, extension = 'png') {
    const base64 = await page.evaluate((options) => window.drawFrame(options), {
      shot,
      width,
      height,
      mode,
      position,
    });
    await writeFile(`${directory}${name}.${extension}`, Buffer.from(base64, 'base64'));
  }

  for (const shot of ['desk', 'closed', 'receipt', 'paper-lower', 'printer-a', 'printer-b', 'record']) {
    await write(shot, shot, 1080, 1920, 'capture');
    if (shot === 'closed' || shot === 'paper-lower') continue;
    await write(shot + '-wide', shot, 1120, 780, 'front');
    if (shot.startsWith('printer')) await write(shot + '-back-wide', shot, 1120, 780, 'back');
  }

  await mkdir(directory + 'turn', { recursive: true });
  for (const index of Array.from({ length: 45 }, (_, index) => index)) {
    const position = Math.min(1, index / 35);
    await write('turn/' + String(index).padStart(3, '0'), 'printer-b', 720, 480, 'turn', position, 'jpeg');
  }
  console.log('Captured 7 portrait shots, 7 web stills and 45 frames of the printer turning.');
} finally {
  await browser.close();
}
