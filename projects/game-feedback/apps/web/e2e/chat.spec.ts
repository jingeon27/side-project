import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { ChatMessage, Conversation } from '@game-feedback/contracts';
import { listConversations, listChatMessages } from '@game-feedback/sdk';
import {
  ListConversationsResponse,
  ListChatMessagesResponse,
} from '../../../packages/sdk/src/generated/validation';

const origin = 'http://127.0.0.1:3301';

async function participant(browser: Browser, nickname: string) {
  const context = await browser.newContext({ baseURL: origin });
  const response = await context.request.post('/api/auth/demo', {
    headers: { Origin: origin },
    data: { nickname },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const session = await response.json();
  return { context, user: session.user as { id: string; nickname: string } };
}

async function openRealtime(page: Page, url: string) {
  const stream = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/chat/events' && response.status() === 200,
  );
  await page.goto(url);
  expect((await stream).headers()['content-type']).toContain('text/event-stream');
}

async function send(page: Page, body: string): Promise<ChatMessage> {
  await page.getByRole('textbox', { name: '메시지 내용' }).fill(body);
  const response = page.waitForResponse(
    (item) =>
      /\/api\/conversations\/[^/]+\/messages$/.test(new URL(item.url()).pathname) &&
      item.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  const sent = await response;
  expect(sent.ok(), await sent.text()).toBeTruthy();
  return sent.json();
}

async function conversation(context: BrowserContext, recipientId: string): Promise<Conversation> {
  const response = await context.request.post('/api/conversations', {
    headers: { Origin: origin },
    data: { recipientId },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test('two players exchange persistent private messages live, with unread and read receipts', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const author = await participant(browser, `채팅작성자_${suffix}`);
  const coach = await participant(browser, `채팅코치_${suffix}`);
  try {
    const categories = await (await author.context.request.get('/api/categories')).json();
    const created = await author.context.request.post('/api/posts', {
      headers: { Origin: origin },
      data: {
        title: `같이 이야기할 덱 피드백 ${suffix}`,
        body: '호그 덱으로 수비를 마친 다음 공격하는 타이밍에 관해 더 자세하게 이야기하고 싶어요.',
        categoryId: categories[0].id,
      },
    });
    expect(created.ok()).toBeTruthy();
    const post = await created.json();
    const authorPage = await author.context.newPage();
    const coachPage = await coach.context.newPage();
    await openRealtime(authorPage, `/ko/posts/${post.id}`);
    await openRealtime(coachPage, `/ko/posts/${post.id}`);
    await coachPage
      .getByRole('button', { name: `${author.user.nickname}님과 채팅하기`, exact: true })
      .first()
      .click();
    await expect(coachPage).toHaveURL(/\/ko\/messages\/[^/?]+$/);
    const conversationId = new URL(coachPage.url()).pathname.split('/').at(-1);
    expect(conversationId).toBeTruthy();
    const first = await send(coachPage, `상대 건물 카드가 빠졌을 때 호그로 압박해 보세요. ${suffix}`);
    await expect(authorPage.getByRole('link', { name: '채팅 1개', exact: true })).toBeVisible();
    await authorPage.goto(`/ko/messages?conversation=${conversationId}`);
    await expect(authorPage.getByTestId(`message-${first.id}`)).toContainText(first.body);
    await expect(coachPage.getByTestId(`message-${first.id}`)).toContainText('읽음');
    const reply = await send(authorPage, `고마워요. 상대 건물을 확인한 뒤 한 번 더 순환해 볼게요. ${suffix}`);
    await expect(coachPage.getByTestId(`message-${reply.id}`)).toContainText(reply.body);
    await expect(authorPage.getByTestId(`message-${reply.id}`)).toContainText('읽음');
    await coachPage.reload();
    await expect(coachPage.getByTestId(`message-${first.id}`)).toContainText(first.body);
    await expect(coachPage.getByTestId(`message-${reply.id}`)).toContainText(reply.body);
    await coachPage.screenshot({ path: 'test-results/chat-desktop.png', fullPage: true });
    await coachPage.setViewportSize({ width: 390, height: 844 });
    await expect(coachPage.getByRole('textbox', { name: '메시지 내용' })).toBeVisible();
    expect(
      await coachPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await coachPage.screenshot({ path: 'test-results/chat-mobile.png', fullPage: true });

    const nativeFetch = globalThis.fetch;
    const state = await author.context.storageState();
    const cookie = state.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
    globalThis.fetch = (input, options) => {
      const headers = new Headers(options?.headers);
      headers.set('Cookie', cookie);
      return nativeFetch(new URL(String(input), origin), { ...options, headers });
    };
    try {
      const inbox = ListConversationsResponse.parse(await listConversations());
      expect(inbox.items.some((item) => item.id === conversationId)).toBeTruthy();
      const history = ListChatMessagesResponse.parse(await listChatMessages(String(conversationId)));
      expect(history.items.filter((item) => item.id === first.id)).toHaveLength(1);
      expect(history.items.filter((item) => item.id === reply.id)).toHaveLength(1);
    } finally {
      globalThis.fetch = nativeFetch;
    }
  } finally {
    await author.context.close();
    await coach.context.close();
  }
});

test('a failed send preserves the draft and retries with the same idempotency key', async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const sender = await participant(browser, `재전송_${suffix}`);
  const peer = await participant(browser, `대화상대_${suffix}`);
  try {
    const room = await conversation(sender.context, peer.user.id);
    const page = await sender.context.newPage();
    await openRealtime(page, `/ko/messages?conversation=${room.id}`);
    const keys: string[] = [];
    let failed = false;
    await page.route(`**/api/conversations/${room.id}/messages`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      keys.push(route.request().postDataJSON().clientMessageId);
      if (!failed) {
        failed = true;
        return route.abort('failed');
      }
      return route.continue();
    });
    const body = `연결이 복구되면 이 메시지를 다시 보낼게요. ${suffix}`;
    await page.getByRole('textbox', { name: '메시지 내용' }).fill(body);
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: /작성한 내용/ })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '메시지 내용' })).toHaveValue(body);
    await page.getByRole('button', { name: '다시 보내기', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '메시지 내용' })).toHaveValue('');
    const history = await (await sender.context.request.get(`/api/conversations/${room.id}/messages`)).json();
    expect(history.items.filter((item: ChatMessage) => item.body === body)).toHaveLength(1);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    await send(page, body);
    const repeated = await (
      await sender.context.request.get(`/api/conversations/${room.id}/messages`)
    ).json();
    expect(repeated.items.filter((item: ChatMessage) => item.body === body)).toHaveLength(2);
    expect(keys).toHaveLength(3);
    expect(keys[2]).not.toBe(keys[0]);
  } finally {
    await sender.context.close();
    await peer.context.close();
  }
});
