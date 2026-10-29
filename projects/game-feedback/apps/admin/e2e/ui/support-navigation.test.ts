import { expect, test } from '@playwright/test';

import { ChatMessageListSchema, SessionSchema, SupportThreadSchema } from '@game-feedback/contracts';

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
