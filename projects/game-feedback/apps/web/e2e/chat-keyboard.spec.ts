import { test, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:3301';
const conversationId = 'sample-conversation-0-3';

for (const width of [400, 1440]) {
  test(`desktop Enter sends at ${width}px while Shift+Enter, composition and repeated keys preserve drafts`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const login = await page.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-0' },
    });
    expect(login.ok()).toBe(true);
    await page.goto(`/ko/messages/${conversationId}`);
    if (width <= 760) await expect(page.getByRole('contentinfo')).toBeHidden();
    const input = page.getByRole('textbox', { name: '메시지 내용' });
    const firstLine = `데스크톱 키보드 ${width} ${Date.now().toString(36)}`;
    await input.fill(firstLine);
    await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
    await expect(input).toHaveValue(firstLine);
    await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229 });
    await expect(input).toHaveValue(firstLine);
    await input.press('Shift+Enter');
    await input.pressSequentially('둘째 줄');
    const body = `${firstLine}\n둘째 줄`;
    await expect(input).toHaveValue(body);
    const isSend = (response: { url: () => string; request: () => { method: () => string } }) =>
      response.url().endsWith(`/api/conversations/${conversationId}/messages`) &&
      response.request().method() === 'POST';
    const sent = page.waitForResponse(isSend, { timeout: 5_000 });
    await input.press('Enter');
    const response = await sent;
    expect(response.ok()).toBe(true);
    const message = await response.json();
    await expect(input).toBeEmpty();
    await expect(page.getByTestId(`message-${message.id}`)).toContainText(body);

    const nextBody = `${firstLine} 반복 키 확인`;
    await input.fill(nextBody);
    const prevented = await input.evaluate(
      (node) =>
        !node.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            repeat: true,
            bubbles: true,
            cancelable: true,
          }),
        ),
    );
    expect(prevented).toBe(true);
    await expect(input).toHaveValue(nextBody);
    const nextSent = page.waitForResponse(isSend);
    await input.press('Enter');
    expect((await nextSent).ok()).toBe(true);
    await expect(input).toBeEmpty();
    const history = await (await page.request.get(`/api/conversations/${conversationId}/messages`)).json();
    expect(history.items.filter((item: { body: string }) => item.body === body)).toHaveLength(1);
    expect(history.items.filter((item: { body: string }) => item.body === nextBody)).toHaveLength(1);
    await page.reload();
    await expect(page.getByTestId(`message-${message.id}`)).toContainText(body);
  });
}
