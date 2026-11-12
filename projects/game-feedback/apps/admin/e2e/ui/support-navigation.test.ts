import { expect, test, type Page, type Route } from '@playwright/test';

import {
  ChatMessageInputSchema,
  ChatMessageListSchema,
  ChatMessageSchema,
  SessionSchema,
  SupportThreadSchema,
} from '@game-feedback/contracts';

const requester = {
  id: 'browser-user',
  nickname: '브라우저 문의자',
  isVerified: false,
  supercellTag: null,
  isTestAccount: false,
};
const timestamp = '2026-10-29T00:00:00.000Z';
const thread = SupportThreadSchema.parse({
  id: 'browser-thread',
  conversationId: 'browser-conversation',
  requester,
  adminId: 'browser-admin',
  topic: 'GENERAL',
  status: 'OPEN',
  createdAt: timestamp,
  updatedAt: timestamp,
});
const session = SessionSchema.parse({
  user: { ...requester, id: 'browser-admin', role: 'ADMIN', createdAt: timestamp, verifiedAt: null },
  demoMode: false,
  googleConfigured: false,
  needsOnboarding: false,
});
const messages = ChatMessageListSchema.parse({
  conversation: {
    id: thread.conversationId,
    peer: requester,
    lastMessage: null,
    unreadCount: 0,
    updatedAt: timestamp,
    peerLastReadAt: null,
  },
  items: [],
  nextCursor: null,
});

test('목록 실패와 상태 필터 변경에도 열린 문의·답변 초안·다른 URL 필드를 보존해야 한다', async ({ page }) => {
  const unexpected: string[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/admin/auth/session') return route.fulfill({ json: session });
      if (url.pathname === `/api/admin/support/${thread.id}`) return route.fulfill({ json: thread });
      if (url.pathname === `/api/admin/support/${thread.conversationId}/messages`)
        return route.fulfill({ json: messages });
      if (url.pathname === '/api/admin/support') {
        if (url.searchParams.get('status') === 'CLOSED')
          return route.fulfill({ status: 503, json: { errorCode: 'UNAVAILABLE', message: '목록 실패' } });
        return route.fulfill({ json: { items: [], nextCursor: null } });
      }
      unexpected.push(url.pathname);
      return route.abort();
    },
  );
  await page.goto('/#support?thread=browser-thread&status=invalid&view=compact');
  const filters = page.getByRole('navigation', { name: '문의 상태' });
  await expect(filters.getByRole('link', { name: '전체', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const conversation = page.getByRole('region', { name: '문의 대화' });
  const draft = conversation.getByRole('textbox', { name: '답변 내용' });
  await draft.fill('필터를 바꿔도 남아야 하는 답변');
  await filters.getByRole('link', { name: '처리 완료', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('정보를 불러오지 못했습니다.');
  await expect(draft).toHaveValue('필터를 바꿔도 남아야 하는 답변');
  await expect(filters.getByRole('link', { name: '처리 완료', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page).toHaveURL(/thread=browser-thread&view=compact&status=CLOSED$/);
  await filters.getByRole('link', { name: '전체', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(draft).toHaveValue('필터를 바꿔도 남아야 하는 답변');
  await expect(page).toHaveURL(/thread=browser-thread&view=compact$/);
  expect(unexpected).toEqual([]);
});

async function openReplyPage(page: Page, send: (route: Route) => Promise<void>) {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/admin/auth/session') return route.fulfill({ json: session });
      if (pathname === `/api/admin/support/${thread.id}`) return route.fulfill({ json: thread });
      if (pathname === `/api/admin/support/${thread.conversationId}/messages`) {
        if (route.request().method() === 'POST') return send(route);
        return route.fulfill({ json: messages });
      }
      if (pathname === '/api/admin/support') return route.fulfill({ json: { items: [], nextCursor: null } });
      throw new Error(`Unexpected browser API request: ${pathname}`);
    },
  );
  await page.goto(`/#support?thread=${thread.id}`);
}

async function acceptReply(route: Route) {
  const input = ChatMessageInputSchema.parse(route.request().postDataJSON());
  await route.fulfill({
    json: ChatMessageSchema.parse({
      ...input,
      id: `message-${input.clientMessageId}`,
      conversationId: thread.conversationId,
      sender: session.user,
      createdAt: timestamp,
    }),
  });
  return input;
}

test('답변 전송 중 작성한 다음 초안은 이전 전송 성공으로 지워지지 않아야 한다', async ({ page }) => {
  const requests: Route[] = [];
  await openReplyPage(page, async (route) => {
    requests.push(route);
  });
  const draft = page.getByRole('textbox', { name: '답변 내용' });
  const submit = page.getByRole('button', { name: '답변 보내기' });
  await draft.fill('먼저 보낼 답변');
  await submit.click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(submit).toBeDisabled();
  await expect(draft).toBeEditable();
  await draft.fill('전송 중에 새로 쓴 다음 답변');
  const [first] = requests;
  if (!first) throw new Error('Missing first reply request');
  const sent = await acceptReply(first);
  expect(sent.body).toBe('먼저 보낼 답변');
  await expect(submit).toBeEnabled();
  await expect(draft).toHaveValue('전송 중에 새로 쓴 다음 답변');

  await submit.click();
  await expect.poll(() => requests.length).toBe(2);
  const second = requests.at(1);
  if (!second) throw new Error('Missing next reply request');
  const next = await acceptReply(second);
  expect(next.body).toBe('전송 중에 새로 쓴 다음 답변');
  expect(next.clientMessageId).not.toBe(sent.clientMessageId);
  await expect(submit).toBeEnabled();
  await expect(draft).toHaveValue('');
});

test('실패한 답변의 초안과 재시도 식별자는 유지하고 수락된 초안만 비워야 한다', async ({ page }) => {
  const attempts: Route[] = [];
  await openReplyPage(page, async (route) => {
    attempts.push(route);
    if (attempts.length === 1)
      await route.fulfill({ status: 503, json: { errorCode: 'UNAVAILABLE', message: '전송 실패' } });
  });
  const draft = page.getByRole('textbox', { name: '답변 내용' });
  const submit = page.getByRole('button', { name: '답변 보내기' });
  await draft.fill('  재시도할 답변  ');
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('전송 실패');
  await expect(draft).toHaveValue('  재시도할 답변  ');
  await submit.click();
  await expect.poll(() => attempts.length).toBe(2);
  const [first, retry] = attempts;
  if (!first || !retry) throw new Error('Missing reply retry requests');
  const original = ChatMessageInputSchema.parse(first.request().postDataJSON());
  const accepted = await acceptReply(retry);
  expect(accepted).toEqual(original);
  expect(accepted.body).toBe('재시도할 답변');
  await expect(submit).toBeEnabled();
  await expect(draft).toHaveValue('');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
