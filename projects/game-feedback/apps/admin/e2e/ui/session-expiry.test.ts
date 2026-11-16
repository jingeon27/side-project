import { expect, test, type Page } from '@playwright/test';

import {
  AdminChatMessageListSchema,
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
const timestamp = '2026-11-11T00:00:00.000Z';
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
const anonymous = SessionSchema.parse({
  user: null,
  demoMode: false,
  googleConfigured: false,
  needsOnboarding: false,
});
const adminSession = (id: string, nickname: string) =>
  SessionSchema.parse({
    ...anonymous,
    user: { ...requester, id, nickname, role: 'ADMIN', createdAt: timestamp, verifiedAt: null },
  });
const session = adminSession('browser-admin', '브라우저 운영자');
const messages = AdminChatMessageListSchema.parse({
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

/** 관리자 API만 대체한다. 다시 로그인하면 `loginAs` 관리자의 세션이 열린다. */
async function routeAdminApi(page: Page, loginAs: typeof session) {
  const server = { signedIn: true, session };
  const replies: string[] = [];
  const unexpected: string[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const replyPath = `/api/admin/support/${thread.conversationId}/messages`;
      if (url.pathname === replyPath && request.method() === 'POST')
        replies.push(request.postDataJSON().clientMessageId);
      if (url.pathname === '/api/admin/auth/session')
        return route.fulfill({ json: server.signedIn ? server.session : anonymous });
      if (url.pathname === '/api/admin/auth/login') {
        server.signedIn = true;
        server.session = loginAs;
        return route.fulfill({ json: loginAs });
      }
      if (!server.signedIn)
        return route.fulfill({
          status: 401,
          json: { errorCode: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' },
        });
      if (url.pathname === '/api/admin/support')
        return route.fulfill({ json: { items: [thread], nextCursor: null } });
      if (url.pathname === '/api/admin/reports')
        return route.fulfill({ json: { items: [], nextCursor: null } });
      if (url.pathname === `/api/admin/support/${thread.id}`) return route.fulfill({ json: thread });
      if (url.pathname === replyPath && request.method() === 'GET') return route.fulfill({ json: messages });
      if (url.pathname === replyPath) {
        const input = request.postDataJSON();
        return route.fulfill({
          json: ChatMessageSchema.parse({
            id: 'browser-message',
            conversationId: thread.conversationId,
            sender: requester,
            body: input.body,
            createdAt: timestamp,
            clientMessageId: input.clientMessageId,
          }),
        });
      }
      unexpected.push(url.pathname);
      return route.abort();
    },
  );
  return { server, replies, unexpected };
}

/** 답변을 쓰는 중에 세션이 끝나 보내기가 401로 거절된 화면 */
async function expireWhileReplying(page: Page, server: { signedIn: boolean }, body: string) {
  await page.goto('/#support?thread=browser-thread');
  const conversation = page.getByRole('region', { name: '문의 대화' });
  const draft = conversation.getByRole('textbox', { name: '답변 내용' });
  await draft.fill(body);
  server.signedIn = false;
  await conversation.getByRole('button', { name: '답변 보내기', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '로그인 시간이 지났습니다.' })).toBeVisible();
  return { conversation, draft };
}

async function logIn(page: Page, username: string) {
  await page.getByRole('textbox', { name: '아이디', exact: true }).fill(username);
  await page.getByLabel('비밀번호', { exact: true }).fill('isolated-browser-password');
  await page.getByRole('button', { name: '관리자 로그인', exact: true }).click();
}

test('세션이 만료되면 답변 초안을 숨긴 채 다시 로그인하게 하고 같은 초안과 재전송 ID로 돌아와야 한다', async ({
  page,
}) => {
  const { server, replies, unexpected } = await routeAdminApi(page, session);
  const { conversation, draft } = await expireWhileReplying(page, server, '만료 전에 쓰던 답변');

  await expect(page.getByRole('heading', { name: '관리자 로그인이 필요합니다.' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '아이디', exact: true })).toBeFocused();
  await expect(draft).toBeHidden();
  await logIn(page, 'browser-admin');

  await expect(draft).toHaveValue('만료 전에 쓰던 답변');
  await expect(page.getByRole('heading', { name: '관리자 로그인이 필요합니다.' })).toHaveCount(0);
  // 만료를 알린 401은 만료 화면이 맡았으므로 다시 로그인한 화면에 남지 않는다.
  await expect(page.getByRole('alert')).toHaveCount(0);
  await conversation.getByRole('button', { name: '답변 보내기', exact: true }).click();
  await expect(draft).toHaveValue('');
  expect(replies).toHaveLength(2);
  expect(replies[1]).toBe(replies[0]);
  expect(unexpected).toEqual([]);
});

test('만료 중에 불러오지 못한 영역은 다시 로그인하면 다시 시도 없이 다시 불러와야 한다', async ({ page }) => {
  const { server, unexpected } = await routeAdminApi(page, session);
  await page.goto('/#support?thread=browser-thread');
  await expect(page.getByRole('region', { name: '문의 대화' })).toBeVisible();
  server.signedIn = false;
  // 새로 여는 신고함 조회가 401로 실패해 영역 오류가 된 뒤 만료 화면이 뜬다.
  await page.evaluate(() => {
    window.location.hash = '#reports';
  });
  await expect(page.getByRole('heading', { name: '관리자 로그인이 필요합니다.' })).toBeVisible();

  await logIn(page, 'browser-admin');

  await expect(page.getByRole('heading', { name: '신고함', exact: true })).toBeVisible();
  await expect(page.getByText('해당 상태의 신고가 없습니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(unexpected).toEqual([]);
});

test('만료 화면에서 다른 관리자로 로그인하면 이전 관리자의 답변 초안을 남기지 않아야 한다', async ({
  page,
}) => {
  const { server, unexpected } = await routeAdminApi(
    page,
    adminSession('browser-other-admin', '다른 운영자'),
  );
  const { draft } = await expireWhileReplying(page, server, '이전 관리자가 쓰던 답변');

  await logIn(page, 'browser-other-admin');

  await expect(page.getByText('다른 운영자', { exact: true })).toBeVisible();
  await expect(draft).toHaveValue('');
  expect(unexpected).toEqual([]);
});
