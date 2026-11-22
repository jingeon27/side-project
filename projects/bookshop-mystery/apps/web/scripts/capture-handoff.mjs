import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect } from '@playwright/test';

const preview = new URL(process.argv[2] ?? 'http://127.0.0.1:43737');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(preview.hostname)) {
  throw new Error('격리된 로컬 프리뷰 주소를 사용하세요.');
}
const output = fileURLToPath(new URL('../../../production/.work/printer-handoff.mp4', import.meta.url));
await mkdir(dirname(output), { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), 'bookshop-handoff-'));
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.route(/https:\/\/[^/]*\.amplitude\.com\//, (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem(
      'dawn-archive:last-receipt:v1',
      JSON.stringify({ clues: ['receipt'], viewedBottoms: ['printer-a'], recordDocuments: [] }),
    );
  });
  await page.goto(new URL('/play/', preview).href);

  const timeline = page.getByRole('list', { name: '조사 진행도' });
  const active = timeline.locator('[aria-current="step"]');
  const next = timeline.getByRole('button', { name: '이관 기록', exact: true });
  const clip = { x: 0, y: 0, width: 390, height: 110 };
  const snapshot = () => page.screenshot({ clip });
  const still = (image, frames) => Array.from({ length: frames }, () => image);

  await expect(active).toContainText('프린터');
  const before = await snapshot();
  await page.getByRole('button', { name: '프린터 B 밑면 보기' }).click();
  await expect(next.getByText('다음', { exact: true })).toBeVisible();
  const completion = [];
  for (const _ of Array.from({ length: 36 })) {
    completion.push(await snapshot());
  }
  await expect(active.locator('[data-motion-ready] svg')).toBeVisible();
  await expect(active).toContainText('프린터');
  const unlocked = await snapshot();

  const indicator = next.locator('[data-slot="timeline-indicator"]');
  const target = await indicator.boundingBox();
  if (!target) throw new Error('이관 기록 표시를 찾을 수 없습니다.');
  await page.evaluate(({ x, y, width, height }) => {
    const ring = document.createElement('span');
    ring.id = 'capture-tap';
    ring.style.cssText = `position:fixed;left:${x - 5}px;top:${y - 5}px;width:${width + 10}px;height:${height + 10}px;border:2px solid #ffe0b8;border-radius:10px;z-index:10;pointer-events:none;`;
    document.body.append(ring);
  }, target);
  const tap = await snapshot();
  await next.click();
  await page.locator('#capture-tap').evaluate((ring) => ring.remove());
  await expect(active).toContainText('이관 기록');
  const evidence = await page.getByRole('tabpanel').locator('.evidence-paper').boundingBox();
  if (!evidence || evidence.y < clip.height) throw new Error('캡처 영역이 이관 장소를 드러냅니다.');
  const opened = await snapshot();

  const frames = [
    ...still(before, 18),
    ...completion,
    ...still(unlocked, 111),
    ...still(tap, 9),
    ...still(opened, 96),
  ];
  for (const [index, frame] of frames.entries()) {
    await writeFile(join(scratch, `${String(index).padStart(3, '0')}.png`), frame);
  }
  execFileSync(
    process.env.DAWN_FFMPEG ?? 'ffmpeg',
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-framerate',
      '30',
      '-i',
      join(scratch, '%03d.png'),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '17',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      output,
    ],
    { stdio: 'inherit' },
  );
  console.log(output);
} finally {
  await browser.close();
  await rm(scratch, { recursive: true, force: true });
}
