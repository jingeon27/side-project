import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { OverlayProvider } from 'overlay-kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notificationTypePolicies } from '@/features/notification';
import { MeDocument, MyNotificationsDocument, NotificationType } from '@/shared/api/generated';

import {
  createBrowserClient,
  createServerClient,
  hydrateOnClient,
  renderOnServer,
} from '../../../../test/support/ssr-hydration';
import { NotificationsPageTemplate } from './NotificationsPageTemplate';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/notifications',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => router,
}));

beforeEach(() => vi.clearAllMocks());

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

const viewer = {
  __typename: 'User' as const,
  id: 'owner',
  nickname: '그룹장',
  avatar: null,
  needsOnboarding: false,
  isAnonymous: false,
};

/** 그룹 이동만 하는 가입 승인 알림 25개를 20개씩 나누어 주고, 읽음 저장은 release 전까지 응답하지 않는다. */
function createNotificationClient() {
  const notices = Array.from({ length: 25 }, (_, index) => ({
    ...notification,
    id: `notification-${index + 1}`,
    type: NotificationType.JoinApproved,
    groupId: `group-${index + 1}`,
    groupName: `알림 그룹 ${index + 1}번`,
    joinRequestId: null,
    actorNickname: null,
  }));
  const operations: string[] = [];
  const pending: Array<() => void> = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable((sink) => {
        const name = operation.operationName ?? '';
        operations.push(name);
        const reply = (data: Record<string, unknown>) => {
          sink.next({ data });
          sink.complete();
        };
        if (name === 'MarkNotificationRead') {
          pending.push(() => reply({ markNotificationRead: true }));
          return;
        }
        if (name === 'Me') {
          queueMicrotask(() => reply({ me: viewer }));
          return;
        }
        const { offset, limit } = operation.variables as { offset: number; limit: number };
        queueMicrotask(() =>
          reply({
            myNotifications: {
              __typename: 'NotificationPage',
              items: notices.slice(offset, offset + limit),
              unreadCount: notices.length,
              hasMore: offset + limit < notices.length,
            },
          }),
        );
      }),
  );
  return {
    client: new ApolloClient({ cache: new InMemoryCache({ typePolicies: notificationTypePolicies }), link }),
    operations,
    release: () => pending.splice(0).forEach((respond) => respond()),
  };
}

async function renderNotifications(client: ApolloClient) {
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <OverlayProvider>
          <NotificationsPageTemplate />
        </OverlayProvider>
      </ApolloProvider>,
    );
  });
  return screen.findByRole('list', { name: '활동 알림' });
}

describe('알림 읽음 회귀', () => {
  it('읽음 저장을 기다리지 않고 알림이 가리키는 화면을 바로 열어야 한다', async () => {
    const { client, operations } = createNotificationClient();
    const user = userEvent.setup();
    const list = await renderNotifications(client);
    await user.click(within(list).getByRole('button', { name: /알림 그룹 3번/ }));

    expect(operations).toContain('MarkNotificationRead');
    expect(router.push).toHaveBeenCalledWith('/groups/group-3', undefined);
    expect(within(list).getByRole('button', { name: /알림 그룹 3번/ })).not.toHaveTextContent('읽지 않음');
    expect(screen.getByText('읽지 않은 알림 24개')).toBeVisible();
  });

  it('더 불러온 알림을 읽어도 목록을 첫 페이지로 줄이지 않아야 한다', async () => {
    const { client, operations, release } = createNotificationClient();
    const user = userEvent.setup();
    const list = await renderNotifications(client);
    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
    await user.click(screen.getByRole('button', { name: '알림 더 보기' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(25));

    await user.click(within(list).getByRole('button', { name: /알림 그룹 23번/ }));
    await act(async () => release());

    expect(within(list).getAllByRole('listitem')).toHaveLength(25);
    expect(within(list).getByRole('button', { name: /알림 그룹 23번/ })).not.toHaveTextContent('읽지 않음');
    expect(screen.getByText('읽지 않은 알림 24개')).toBeVisible();
    expect(operations.filter((name) => name === 'MyNotifications')).toHaveLength(2);
  });
});
