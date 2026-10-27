import { randomUUID } from 'node:crypto';

import { expect, test, type Locator } from '@playwright/test';

const origin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3301';

async function bottomGap(log: Locator) {
  return log.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop);
}

for (const width of [400, 1440]) {
  test(`${width}px chat follows sending and resizing while preserving earlier reading and history`, async ({
    page,
    browser,
  }) => {
    const peer = await browser.newContext({ baseURL: origin });
    const suffix = Date.now().toString(36);
    try {
      const login = await page.request.post('/api/auth/demo', {
        headers: { Origin: origin },
        data: { nickname: `스크롤작성자_${suffix}` },
      });
      expect(login.ok()).toBe(true);
      const { user } = await login.json();
      expect(
        (
          await peer.request.post('/api/auth/demo', {
            headers: { Origin: origin },
            data: { nickname: `스크롤상대_${suffix}` },
          })
        ).ok(),
      ).toBe(true);
      const created = await peer.request.post('/api/conversations', {
        headers: { Origin: origin },
        data: { recipientId: user.id },
      });
      expect(created.ok()).toBe(true);
      const room = await created.json();
      const sendPeer = async (body: string) => {
        const sent = await peer.request.post(`/api/conversations/${room.id}/messages`, {
          headers: { Origin: origin },
          data: { body, clientMessageId: randomUUID() },
        });
        expect(sent.ok()).toBe(true);
        return sent.json();
      };
      for (const index of Array.from({ length: 34 }, (_, index) => index)) {
        await sendPeer(
          `${index}번째 대화입니다.\n상대의 수비 카드를 확인해보세요.\n공격으로 전환하는 타이밍을 같이 살펴봅니다.`,
        );
      }
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/ko/messages');
      const workspace = page.locator('.chat-workspace');
      await expect(workspace).toBeVisible();
      await expect(page.locator('main').getByRole('heading', { name: '채팅', exact: true })).toHaveCount(0);
      expect((await workspace.boundingBox())?.height).toBeLessThanOrEqual(480);
      const snippet = page.getByTestId(`conversation-${room.id}`).locator('.conversation-preview p');
      await expect(snippet).toHaveCSS('text-overflow', 'ellipsis');
      await expect(snippet).toHaveCSS('white-space', 'nowrap');
      const size = await snippet.evaluate((node) => ({
        height: node.getBoundingClientRect().height,
        line: parseFloat(getComputedStyle(node).lineHeight),
        clipped: node.scrollWidth > node.clientWidth,
      }));
      expect(size.height).toBeLessThanOrEqual(size.line + 1);
      expect(size.clipped).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.goto(`/ko/messages/${room.id}`);
      const log = page.getByRole('log', { name: '대화 메시지' });
      const input = page.getByRole('textbox', { name: '메시지 내용' });
      await expect(log).toBeVisible();
      await expect.poll(() => bottomGap(log)).toBeLessThanOrEqual(2);
      const body = Array.from({ length: 10 }, (_, index) => `여러 줄로 작성하는 답장 ${index}`).join('\n');
      await input.fill(body);
      await expect.poll(() => bottomGap(log)).toBeLessThanOrEqual(2);
      await log.evaluate((node) => {
        node.scrollTop = 0;
      });
      await expect.poll(() => bottomGap(log)).toBeGreaterThan(200);
      const sent = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/conversations/${room.id}/messages`) &&
          response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: '보내기', exact: true }).click();
      const message = await (await sent).json();
      await expect(input).toHaveValue('');
      await expect(page.getByTestId(`message-${message.id}`)).toBeInViewport();
      await expect.poll(() => bottomGap(log)).toBeLessThanOrEqual(2);
      await page.setViewportSize({ width, height: 600 });
      await expect.poll(() => bottomGap(log)).toBeLessThanOrEqual(2);
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => bottomGap(log)).toBeLessThanOrEqual(2);

      await log.evaluate((node) => {
        node.scrollTop = 0;
      });
      await expect.poll(() => bottomGap(log)).toBeGreaterThan(200);
      const before = await log.evaluate((node) => node.scrollTop);
      const incoming = await sendPeer('이전 대화를 읽는 동안 도착한 새 메시지입니다.');
      await expect(page.getByTestId(`message-${incoming.id}`)).toHaveCount(1);
      await expect(page.getByRole('button', { name: '새 메시지가 도착했어요' })).toBeVisible();
      expect(Math.abs((await log.evaluate((node) => node.scrollTop)) - before)).toBeLessThanOrEqual(2);
      const countBeforeHistory = await log.locator('[data-message-id]').count();
      const anchorId = await log.locator('[data-message-id]').first().getAttribute('data-message-id');
      if (!anchorId) throw new Error('No history anchor is visible.');
      const anchor = page.getByTestId(`message-${anchorId}`);
      const anchorTop = (await anchor.boundingBox())?.y;
      await page.getByRole('button', { name: '이전 메시지 불러오기' }).click();
      await expect.poll(() => log.locator('[data-message-id]').count()).toBeGreaterThan(countBeforeHistory);
      await expect
        .poll(async () => Math.abs(((await anchor.boundingBox())?.y ?? 0) - (anchorTop ?? 0)))
        .toBeLessThanOrEqual(2);
      await page.getByRole('button', { name: '새 메시지가 도착했어요' }).click();
      await expect.poll(() => bottomGap(log)).toBeLessThanOrEqual(2);

      const header = await page.locator('.conversation-heading').boundingBox();
      const composer = await page.locator('.chat-compose-area').boundingBox();
      expect(header?.height).toBeLessThanOrEqual(68);
      expect(composer?.height).toBeLessThanOrEqual(80);
      if (width > 760)
        expect((await page.locator('.chat-workspace').boundingBox())?.height).toBeLessThanOrEqual(520);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await peer.close();
    }
  });
}
