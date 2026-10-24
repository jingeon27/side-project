import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { NotificationListSchema } from '@game-feedback/contracts';

test('새 채팅의 실제 메시지 개수를 탭에 표시하고 알림에서 대화를 읽으면 두 배지를 갱신해야 한다', async ({
  page,
  browser,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1:3301').origin;
  const headers = { Origin: origin };
  const suffix = Date.now().toString(36);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  const recipient = await page.request.post('/api/auth/demo', {
    headers,
    data: { nickname: `알림수신_${suffix}` },
  });
  expect(recipient.ok()).toBe(true);
  const recipientId: string = (await recipient.json()).user.id;
  const sender = await browser.newContext({ baseURL: origin });
  try {
    expect(
      (
        await sender.request.post('/api/auth/demo', { headers, data: { nickname: `알림발신_${suffix}` } })
      ).ok(),
    ).toBe(true);
    const roomResponse = await sender.request.post('/api/conversations', { headers, data: { recipientId } });
    expect(roomResponse.ok()).toBe(true);
    const roomId: string = (await roomResponse.json()).id;
    const stream = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/chat/events' && response.status() === 200,
    );
    await page.goto('/ko');
    await stream;
    for (const body of ['첫 번째 메시지', '두 번째 메시지'])
      expect(
        (
          await sender.request.post(`/api/conversations/${roomId}/messages`, {
            headers,
            data: { body, clientMessageId: randomUUID() },
          })
        ).ok(),
      ).toBe(true);
    await expect(page.getByRole('link', { name: '채팅 2개', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '알림 2개', exact: true }).click();
    const notice = page.getByRole('link').filter({ hasText: '새로운 채팅이 도착했어요' });
    await expect(notice).toHaveCount(2);
    await notice.first().click();
    await expect(page).toHaveURL(`${origin}/ko/messages/${roomId}`);
    await expect(page.getByRole('log').getByText('두 번째 메시지', { exact: true })).toBeVisible();
    await expect
      .poll(
        async () =>
          NotificationListSchema.parse(await (await page.request.get('/api/notifications')).json())
            .unreadCount,
      )
      .toBe(0);
    await page.goto('/ko');
    await expect(page.getByRole('link', { name: '채팅', exact: true })).toBeVisible();
    expect((await (await page.request.get('/api/conversations')).json()).unreadCount).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await sender.close();
  }
});
