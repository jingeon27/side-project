import { readFileSync } from 'node:fs';

import { expect, test } from './support/test';

const origin = 'http://127.0.0.1:3301';
const conversationId = 'sample-conversation-0-3';
const path = `/ko/messages/${conversationId}`;
const image = readFileSync(
  new URL('../src/features/game-profile/assets/clash-royale-icon.jpg', import.meta.url),
);

test('첨부 메시지 전송 중 다른 화면으로 이동해도 전송 전에 첨부를 삭제하지 않아야 한다', async ({ page }) => {
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto(path);
  const name = `in-flight-${Date.now()}.jpg`;
  await page
    .getByLabel('이미지 또는 동영상 첨부')
    .setInputFiles({ name, mimeType: 'image/jpeg', buffer: image });
  await expect(page.locator('.chat-attachment-preview img')).toBeVisible();
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const deleted: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'DELETE' &&
      request.url().includes(`/api/conversations/${conversationId}/attachments/`)
    )
      deleted.push(request.url());
  });
  await page.route(`**/api/conversations/${conversationId}/messages`, async (route) => {
    if (route.request().method() === 'POST') {
      started.resolve();
      await release.promise;
    }
    await route.continue();
  });
  try {
    await page.getByRole('textbox', { name: '메시지 내용' }).fill('화면을 떠나도 보낼 첨부');
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await started.promise;
    await page.getByRole('link', { name: '홈', exact: true }).first().click();
    await expect(page.getByRole('textbox', { name: '메시지 내용' })).toHaveCount(0);
    expect(deleted).toEqual([]);
    const sent = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/api/conversations/${conversationId}/messages`,
    );
    release.resolve();
    const response = await sent;
    expect(response.ok(), await response.text()).toBeTruthy();
    await page.goto(path);
    await expect(page.locator(`.chat-bubble img[alt="${name}"]`)).toBeVisible();
    expect(deleted).toEqual([]);
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
