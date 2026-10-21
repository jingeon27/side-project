import { randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { ChatMessageSchema, SessionSchema } from '@game-feedback/contracts';

const headers = { Origin: 'http://127.0.0.1:3301' };

async function authenticate(context: BrowserContext, accountId: string) {
  const response = await context.request.post('/api/auth/test-token', { headers, data: { accountId } });
  expect(response.ok()).toBe(true);
  const session = SessionSchema.parse(await (await context.request.get('/api/session')).json());
  expect(session.demoMode).toBe(false);
  expect(session.user?.id).toBe(accountId);
}

async function send(page: Page, body: string) {
  await page.getByRole('textbox', { name: '메시지 내용' }).fill(body);
  const delivery = page.waitForResponse(
    (response) =>
      /\/api\/conversations\/[^/]+\/messages$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  const response = await delivery;
  expect(response.ok()).toBe(true);
  return ChatMessageSchema.parse(await response.json());
}

test('test tokens open player chat from a public profile, deliver replies and preserve the conversation list', async ({
  browser,
}) => {
  const player = await browser.newContext({ baseURL: headers.Origin, viewport: { width: 400, height: 900 } });
  const peer = await browser.newContext({ baseURL: headers.Origin });
  try {
    await authenticate(player, 'sample-user-0');
    await authenticate(peer, 'sample-user-3');
    const page = await player.newPage();
    await page.goto('/ko/users/sample-user-3');
    await page.getByRole('button', { name: '덱연구소님과 채팅하기', exact: true }).click();
    await expect(page).toHaveURL(/\/ko\/messages\/[^/?]+$/);
    const roomPath = new URL(page.url()).pathname;
    const peerPage = await peer.newPage();
    await peerPage.goto(roomPath);
    await expect(peerPage.getByRole('textbox', { name: '메시지 내용' })).toBeVisible();
    const message = await send(page, `플레이어에게 질문합니다 ${randomUUID()}`);
    await expect(peerPage.getByTestId(`message-${message.id}`)).toContainText(message.body);
    const reply = await send(peerPage, `플레이어가 답변합니다 ${randomUUID()}`);
    await expect(page.getByTestId(`message-${reply.id}`)).toContainText(reply.body);
    await page.reload();
    await expect(page.getByTestId(`message-${reply.id}`)).toContainText(reply.body);
    await page.goto('/ko/messages');
    await expect(page.locator('.conversation-list:visible')).toContainText(reply.body);
  } finally {
    await player.close();
    await peer.close();
  }
});

for (const [path, label, topic] of [
  ['/ko/contact', '관리자에게 문의하기', '관리자 문의'],
  ['/ko/settings', '프로필 인증 문의', '프로필 인증 문의'],
] as const) {
  test(`test tokens start ${topic} and receive the administrator reply without demo mode`, async ({
    browser,
  }) => {
    const requester = await browser.newContext({
      baseURL: headers.Origin,
      viewport: { width: 400, height: 900 },
    });
    const admin = await browser.newContext({ baseURL: headers.Origin });
    try {
      await authenticate(requester, 'sample-user-0');
      await authenticate(admin, 'sample-test-admin');
      const page = await requester.newPage();
      await page.goto(path);
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page).toHaveURL(/\/ko\/messages\/[^/?]+$/);
      await expect(page.locator('.conversation-peer-meta:visible')).toContainText(topic);
      const adminPage = await admin.newPage();
      await adminPage.goto(new URL(page.url()).pathname);
      await expect(adminPage.getByRole('textbox', { name: '메시지 내용' })).toBeVisible();
      const message = await send(page, `문의 내용을 전달합니다 ${randomUUID()}`);
      await expect(adminPage.getByTestId(`message-${message.id}`)).toContainText(message.body);
      const reply = await send(adminPage, `관리자가 답변합니다 ${randomUUID()}`);
      await expect(page.getByTestId(`message-${reply.id}`)).toContainText(reply.body);
      await page.reload();
      await expect(page.getByTestId(`message-${reply.id}`)).toContainText(reply.body);
      await page.goto('/ko/messages');
      await expect(page.locator('.conversation-list:visible')).toContainText(reply.body);
    } finally {
      await requester.close();
      await admin.close();
    }
  });
}
