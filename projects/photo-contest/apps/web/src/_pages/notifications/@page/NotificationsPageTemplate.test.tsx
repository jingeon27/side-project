import { within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MeDocument, MyNotificationsDocument, NotificationType } from '@/shared/api/generated';

import {
  createBrowserClient,
  createServerClient,
  hydrateOnClient,
  renderOnServer,
} from '../../../../test/support/ssr-hydration';
import { NotificationsPageTemplate } from './NotificationsPageTemplate';

vi.mock('next/navigation', () => ({
  usePathname: () => '/notifications',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const notification = {
  __typename: 'ActivityNotification' as const,
  id: 'notification-1',
  type: NotificationType.JoinRequested,
  groupId: 'group-1',
  groupName: '함께할 친구',
  postId: null,
  postTitle: null,
  commentId: null,
  parentCommentId: null,
  contestId: null,
  contestTitle: null,
  contestFormat: null,
  joinRequestId: 'request-1',
  actorNickname: '새로 온 친구',
  readAt: null,
  createdAt: '2026-10-25T00:00:00.000Z',
};

describe('알림 화면 SSR·hydration', () => {
  it('사전 조회한 알림은 서버에서 다시 요청하지 않고 hydration 뒤에도 다시 받지 않아야 한다', async () => {
    const server = createServerClient((cache) => {
      cache.writeQuery({
        query: MeDocument,
        data: {
          me: {
            __typename: 'User',
            id: 'owner',
            nickname: '그룹장',
            avatar: null,
            needsOnboarding: false,
            isAnonymous: false,
          },
        },
      });
      cache.writeQuery({
        query: MyNotificationsDocument,
        variables: { offset: 0, limit: 20 },
        data: {
          myNotifications: {
            __typename: 'NotificationPage',
            items: [notification],
            unreadCount: 1,
            hasMore: false,
          },
        },
      });
    });
    const { html, errors } = await renderOnServer(server, <NotificationsPageTemplate />);
    expect(errors).toEqual([]);
    expect(html).toContain('새 그룹 가입 신청이 있어요');

    // 라우트의 PreloadQuery가 이동할 때마다 최신 알림을 받으므로 브라우저는 같은 목록을 다시 요청하지 않는다.
    const browser = createBrowserClient(server, () => ({}));
    const view = await hydrateOnClient(html, browser.client, <NotificationsPageTemplate />);
    try {
      expect(within(view.container).getByText('읽지 않은 알림 1개')).toBeVisible();
      expect(
        within(view.container).getByRole('button', { name: /새 그룹 가입 신청이 있어요/ }),
      ).toBeVisible();
      expect(within(view.container).queryByRole('status')).not.toBeInTheDocument();
      expect(browser.operations).toEqual([]);
      expect(view.recoverableErrors).toEqual([]);
    } finally {
      view.unmount();
    }
  });
});
