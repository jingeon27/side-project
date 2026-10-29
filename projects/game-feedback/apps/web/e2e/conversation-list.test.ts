import { expect, test } from './support/test';

const origin = 'http://127.0.0.1:3301';
const headers = { Origin: origin };

test('conversation rows stay compact with a verified peer and a long multiline preview', async ({ page }) => {
  const login = await page.request.post('/api/auth/demo', {
    headers,
    data: { nickname: `목록확인_${Date.now().toString(36)}` },
  });
  expect(login.ok()).toBe(true);
  const created = await page.request.post('/api/conversations', {
    headers,
    data: { recipientId: 'sample-user-3' },
  });
  expect(created.ok()).toBe(true);
  const conversation = await created.json();
  const body = `긴 미리보기 ${'화면 밖으로 밀리지 않는 메시지 '.repeat(12)}\n두 번째 줄`;
  const sent = await page.request.post(`/api/conversations/${conversation.id}/messages`, {
    headers,
    data: { body, clientMessageId: crypto.randomUUID() },
  });
  expect(sent.ok()).toBe(true);
  await page.goto('/ko/messages');
  const row = page.getByTestId(`conversation-${conversation.id}`);
  await expect(row).toContainText('덱연구소');
  await expect(row).toContainText('인증 유저');
  await expect(row).not.toContainText('#9QY82JGY');
  const preview = row.locator('.conversation-preview p');
  for (const width of [320, 393, 768, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    const box = await row.boundingBox();
    if (!box) throw new Error('The conversation row must be visible.');
    expect(box.height).toBeLessThanOrEqual(76);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(preview).toHaveCSS('white-space', 'nowrap');
    await expect(preview).toHaveCSS('text-overflow', 'ellipsis');
    expect(await preview.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await row.click();
  await expect(page).toHaveURL(`/ko/messages/${conversation.id}`);
  await expect(page.locator('.conversation-heading:visible')).toContainText('덱연구소');
});
