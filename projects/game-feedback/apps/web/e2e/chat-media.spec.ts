import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const origin = 'http://127.0.0.1:3301';
const room = 'sample-conversation-0-3';
const path = `/ko/messages/${room}`;
const imageFixture = readFileSync(
  new URL('../src/features/game-profile/assets/clash-royale-icon.jpg', import.meta.url),
);
test.describe('mobile chat input', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('mobile Enter inserts a line break and an uploaded image survives a failed response and retry', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-0' },
    });
    await page.goto(path);
    await expect(page.getByText('Enter로 보내기, Shift + Enter로 줄바꿈')).toHaveCount(0);
    const input = page.getByRole('textbox', { name: '메시지 내용' });
    await input.fill('First line');
    await input.press('Enter');
    await input.pressSequentially('Second line');
    await expect(input).toHaveValue('First line\nSecond line');
    const name = `practice-${Date.now()}.jpg`;
    await page
      .getByLabel('이미지 또는 동영상 첨부')
      .setInputFiles({ name, mimeType: 'image/jpeg', buffer: imageFixture });
    await expect(page.locator('.chat-attachment-preview img')).toBeVisible();
    const routePattern = `**/api/conversations/${room}/messages`;
    await page.route(routePattern, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fetch();
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ errorCode: 'TEMPORARY', message: '테스트 전송 응답 실패' }),
      });
    });
    try {
      await page.getByRole('button', { name: '보내기', exact: true }).click();
      await expect(page.locator('.chat-send-error[role="alert"]')).toContainText('테스트 전송 응답 실패');
      await expect(input).toHaveValue('First line\nSecond line');
      await expect(page.locator('.chat-attachment-preview img')).toBeVisible();
    } finally {
      await page.unrouteAll({ behavior: 'wait' });
    }
    await page.getByRole('button', { name: '다시 보내기', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(page.locator(`.chat-bubble img[alt="${name}"]`)).toHaveCount(1);
    await page.getByRole('button', { name: `이미지 크게 보기: ${name}`, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('dialog')
      .screenshot({ path: '/tmp/game-feedback-community-image-viewer.png', animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.screenshot({
      path: '/tmp/game-feedback-community-mobile-image-chat.png',
      animations: 'disabled',
    });
    const peer = await browser.newContext({ baseURL: origin });
    try {
      await peer.request.post('/api/auth/test-login', {
        headers: { Origin: origin },
        data: { accountId: 'sample-user-3' },
      });
      const other = await peer.newPage();
      await other.goto(path);
      const image = other.locator(`.chat-bubble img[alt="${name}"]`);
      await expect(image).toBeVisible();
      await expect
        .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      await other.reload();
      await expect(image).toBeVisible();
    } finally {
      await peer.close();
    }
  });
});
test('sends a playable video without text and supports authenticated byte ranges', async ({
  page,
  browser,
}) => {
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto(path);
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    context?.fillRect(0, 0, 160, 90);
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    const result = new Promise<number[]>((resolve, reject) => {
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onerror = () => reject(new Error('Recording failed'));
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        resolve([...new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer())]);
      };
    });
    recorder.start();
    setTimeout(() => recorder.stop(), 200);
    return result;
  });
  const name = `practice-${Date.now()}.webm`;
  await page
    .getByLabel('이미지 또는 동영상 첨부')
    .setInputFiles({ name, mimeType: 'video/webm', buffer: Buffer.from(bytes) });
  await expect(page.locator('.chat-attachment-preview video')).toBeVisible();
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  const video = page.locator(`.chat-bubble video[aria-label="${name}"]`);
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  const url = await video.getAttribute('src');
  await page.screenshot({ path: '/tmp/game-feedback-community-video-chat.png', animations: 'disabled' });
  const peer = await browser.newContext({ baseURL: origin });
  try {
    await peer.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-3' },
    });
    const ranged = await peer.request.get(url ?? '', { headers: { Range: 'bytes=0-31' } });
    expect(ranged.status()).toBe(206);
    expect((await ranged.body()).length).toBe(32);
    const other = await peer.newPage();
    await other.goto(path);
    await expect(other.locator(`video[aria-label="${name}"]`)).toBeVisible();
  } finally {
    await peer.close();
  }
});
