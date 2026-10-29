import { randomUUID } from 'node:crypto';

import { expect, test } from './support/fixtures';
import { ORIGIN } from './support/native-host';

test('400px WebView keeps the newest message visible through multiline input, sending and keyboard resizing', async ({
  page,
  browser,
  nativeHost,
}) => {
  const peer = await browser.newContext({ baseURL: ORIGIN });
  const conversationId = 'sample-conversation-0-3';
  try {
    const ownerLogin = await page.request.post('/api/auth/test-login', {
      headers: { Origin: ORIGIN },
      data: { accountId: 'sample-user-0' },
    });
    const peerLogin = await peer.request.post('/api/auth/test-login', {
      headers: { Origin: ORIGIN },
      data: { accountId: 'sample-user-3' },
    });
    expect(ownerLogin.ok() && peerLogin.ok()).toBe(true);
    for (const index of Array.from({ length: 25 }, (_, index) => index)) {
      const response = await peer.request.post(`/api/conversations/${conversationId}/messages`, {
        headers: { Origin: ORIGIN },
        data: {
          body: `${index}번째 대화\n수비 후 공격으로 전환하는 장면을 같이 확인해요.\n서두르지 않고 상대 카드를 확인해요.`,
          clientMessageId: randomUUID(),
        },
      });
      expect(response.ok()).toBe(true);
    }
    await page.setViewportSize({ width: 400, height: 844 });
    await page.goto(`/ko/messages/${conversationId}`);
    await expect.poll(nativeHost.currentPath).toBe(`/ko/messages/${conversationId}`);
    const log = page.getByRole('log', { name: '대화 메시지' });
    const gap = () => log.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop);
    await expect.poll(gap).toBeLessThanOrEqual(2);
    const input = page.getByRole('textbox', { name: '메시지 내용' });
    await input.fill(Array.from({ length: 8 }, (_, index) => `여러 줄 답장 ${index}`).join('\n'));
    await expect.poll(async () => (await input.boundingBox())?.height ?? 0).toBeGreaterThan(44);
    await expect.poll(gap).toBeLessThanOrEqual(2);
    const sent = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/conversations/${conversationId}/messages`) &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    const message = await (await sent).json();
    await expect(input).toHaveValue('');
    await expect(page.getByTestId(`message-${message.id}`)).toBeInViewport();
    await expect.poll(gap).toBeLessThanOrEqual(2);
    await page.setViewportSize({ width: 400, height: 500 });
    await expect.poll(gap).toBeLessThanOrEqual(2);
    await expect.poll(async () => (await input.boundingBox())?.y ?? 1000).toBeLessThan(500);
    expect((await page.locator('.conversation-heading').boundingBox())?.height).toBeLessThanOrEqual(68);
    expect((await page.locator('.chat-compose-area').boundingBox())?.height).toBeLessThanOrEqual(80);
    expect(await nativeHost.requestBack()).toBe(true);
    await expect.poll(nativeHost.currentPath).toBe('/ko/messages');
  } finally {
    await peer.close();
  }
});
