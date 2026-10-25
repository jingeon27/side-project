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

describe('알림 화면 SSR·hydration', () => {
  it('사전 조회한 알림은 서버에서 다시 요청하지 않고 브라우저에서 최신 목록을 받아야 한다', async () => {
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
          myNotifications: { __typename: 'NotificationPage', items: [], unreadCount: 0, hasMore: false },
        },
      });
    });
    const { html, errors } = await renderOnServer(server, <NotificationsPageTemplate />);
    expect(errors).toEqual([]);
    expect(html).toContain('아직 새 알림이 없어요');

    const browser = createBrowserClient(server, () => ({
      myNotifications: {
        __typename: 'NotificationPage',
        items: [
          {
            __typename: 'ActivityNotification',
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
          },
        ],
        unreadCount: 1,
        hasMore: false,
      },
    }));
    const view = await hydrateOnClient(html, browser.client, <NotificationsPageTemplate />);
    try {
      expect(await within(view.container).findByText('읽지 않은 알림 1개')).toBeVisible();
      expect(
        within(view.container).getByRole('button', { name: /새 그룹 가입 신청이 있어요/ }),
      ).toBeVisible();
      expect(browser.operations).toEqual(['MyNotifications']);
      expect(view.recoverableErrors).toEqual([]);
    } finally {
      view.unmount();
    }
  });
});
