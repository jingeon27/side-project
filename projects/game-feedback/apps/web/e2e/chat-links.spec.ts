import { expect, test } from '@playwright/test';

const origin = 'http://127.0.0.1:3301';

test('sent and received chat links open separately and fit a 393px screen after reload', async ({
  browser,
}) => {
  const sender = await browser.newContext({ baseURL: origin });
  const recipient = await browser.newContext({ baseURL: origin });
  const suffix = crypto.randomUUID().slice(0, 8);
  try {
    const senderLogin = await sender.request.post('/api/auth/demo', {
      headers: { Origin: origin },
      data: { nickname: `링크발신_${suffix}` },
    });
    expect(senderLogin.ok()).toBe(true);
    const recipientLogin = await recipient.request.post('/api/auth/demo', {
      headers: { Origin: origin },
      data: { nickname: `링크수신_${suffix}` },
    });
    expect(recipientLogin.ok()).toBe(true);
    const recipientSession = await recipientLogin.json();
    const created = await sender.request.post('/api/conversations', {
      headers: { Origin: origin },
      data: { recipientId: recipientSession.user.id },
    });
    expect(created.ok()).toBe(true);
    const room = await created.json();
    const path = `/ko/messages/${room.id}`;
    const senderPage = await sender.newPage();
    const recipientPage = await recipient.newPage();
    await recipientPage.goto(path);
    await expect(recipientPage.getByRole('textbox', { name: '메시지 내용' })).toBeVisible();
    await senderPage.goto(path);
    const url = 'https://replay.example/watch?v=abc&round=2#finish';
    const longUrl = `https://replay.example/${'replay-'.repeat(70)}`;
    const body = `리플레이를 확인해 주세요.\n(${url})\nwww.example.com\njavascript:alert(1)\n${longUrl}`;
    await senderPage.getByRole('textbox', { name: '메시지 내용' }).fill(body);
    const sent = senderPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/conversations/${room.id}/messages` &&
        response.request().method() === 'POST',
    );
    await senderPage.getByRole('button', { name: '보내기', exact: true }).click();
    const response = await sent;
    expect(response.ok()).toBe(true);
    const message = await response.json();
    const sentBubble = senderPage.getByTestId(`message-${message.id}`);
    const receivedBubble = recipientPage.getByTestId(`message-${message.id}`);
    await expect(sentBubble.getByRole('link', { name: url, exact: true })).toHaveAttribute('href', url);
    await expect(receivedBubble.getByRole('link', { name: url, exact: true })).toHaveAttribute('href', url);
    await expect(receivedBubble.locator('.chat-bubble p')).toHaveText(body);
    await expect(receivedBubble.locator('a[href^="javascript:"]')).toHaveCount(0);

    await sender.route('https://replay.example/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>Replay</title>' }),
    );
    const opened = senderPage.waitForEvent('popup');
    await sentBubble.getByRole('link', { name: url, exact: true }).click();
    const popup = await opened;
    await expect(popup).toHaveURL(url);
    await popup.close();
    await expect(senderPage).toHaveURL(`${origin}${path}`);
    await expect(senderPage.getByRole('textbox', { name: '메시지 내용' })).toBeVisible();

    await recipientPage.setViewportSize({ width: 393, height: 852 });
    await recipientPage.reload();
    await expect(receivedBubble.getByRole('link', { name: longUrl, exact: true })).toHaveAttribute(
      'href',
      longUrl,
    );
    await expect(receivedBubble.getByRole('link', { name: 'www.example.com', exact: true })).toHaveAttribute(
      'href',
      'https://www.example.com',
    );
    expect(
      await recipientPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const bounds = await receivedBubble.locator('.chat-bubble').boundingBox();
    expect(bounds).not.toBeNull();
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(393);
    await recipientPage.screenshot({ path: 'test-results/chat-links-mobile.png' });
  } finally {
    await sender.close();
    await recipient.close();
  }
});
