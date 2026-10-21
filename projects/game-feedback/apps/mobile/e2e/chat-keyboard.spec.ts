import { expect, test } from './support/fixtures';
import { ORIGIN } from './support/native-host';

for (const width of [400, 1440]) {
  test(`WebView Enter keeps line breaks at ${width}px even when desktop pointer capabilities are reported`, async ({
    page,
    nativeHost,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      const matchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        const media = matchMedia(query);
        if (query.includes('(hover: hover)') && query.includes('(pointer: fine)')) {
          Object.defineProperty(media, 'matches', { value: true });
        }
        return media;
      };
    });
    const login = await page.request.post('/api/auth/test-login', {
      headers: { Origin: ORIGIN },
      data: { accountId: 'sample-user-0' },
    });
    expect(login.ok()).toBe(true);
    const conversationId = 'sample-conversation-0-3';
    const path = `/ko/messages/${conversationId}`;
    await page.goto(path);
    await expect.poll(nativeHost.currentPath).toBe(path);
    const input = page.getByRole('textbox', { name: '메시지 내용' });
    const firstLine = `WebView 줄바꿈 ${width} ${Date.now().toString(36)}`;
    await input.fill(firstLine);
    await input.press('Enter');
    await input.pressSequentially('둘째 줄');
    const body = `${firstLine}\n둘째 줄`;
    await expect(input).toHaveValue(body);
    const before = await (await page.request.get(`/api/conversations/${conversationId}/messages`)).json();
    expect(before.items.some((item: { body: string }) => item.body.includes(firstLine))).toBe(false);
    const sent = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/conversations/${conversationId}/messages`) &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    expect((await sent).ok()).toBe(true);
    await expect(input).toBeEmpty();
    const history = await (await page.request.get(`/api/conversations/${conversationId}/messages`)).json();
    expect(history.items.filter((item: { body: string }) => item.body === body)).toHaveLength(1);
  });
}
