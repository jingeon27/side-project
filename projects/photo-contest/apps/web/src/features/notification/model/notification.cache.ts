import type { ApolloCache, Reference } from '@apollo/client';

import { NotificationReadStateFragmentDoc, NotificationUnreadCountDocument } from '@/shared/api/generated';

interface INotificationPageStore {
  items: readonly Reference[];
  unreadCount: number;
  hasMore: boolean;
}

/** 알림 화면의 개수와 상단 배지 개수를 함께 바꾼다. 목록을 다시 받으면 offset 0 응답이 더 읽은 페이지를 지운다. */
function updateUnreadCount(cache: ApolloCache, next: (count: number) => number) {
  cache.updateQuery({ query: NotificationUnreadCountDocument }, (data) =>
    data ? { notificationUnreadCount: next(data.notificationUnreadCount) } : undefined,
  );
  cache.modify<{ myNotifications: INotificationPageStore }>({
    fields: {
      myNotifications: (page, { isReference }) =>
        isReference(page) ? page : { ...page, unreadCount: next(page.unreadCount) },
    },
  });
}

function writeReadAt(cache: ApolloCache, id: string | undefined, readAt: string) {
  if (!id) return;
  cache.updateFragment({ id, fragment: NotificationReadStateFragmentDoc }, (data) =>
    data ? { ...data, readAt: data.readAt ?? readAt } : undefined,
  );
}

/** 알림 하나를 읽음으로 바꾸고 읽지 않은 개수를 하나 줄인다. 이미 읽은 알림이면 아무것도 바꾸지 않는다. */
export function markNotificationReadInCache(cache: ApolloCache, notificationId: string, readAt: string) {
  const id = cache.identify({ __typename: 'ActivityNotification', id: notificationId });
  if (!id) return;
  const current = cache.readFragment({ id, fragment: NotificationReadStateFragmentDoc });
  if (!current || current.readAt) return;
  writeReadAt(cache, id, readAt);
  updateUnreadCount(cache, (count) => Math.max(0, count - 1));
}

/** 불러온 알림을 모두 읽음으로 바꾸고 읽지 않은 개수를 0으로 만든다. 아직 받지 않은 페이지는 서버가 읽은 상태로 준다. */
export function markAllNotificationsReadInCache(cache: ApolloCache, readAt: string) {
  const loaded: Reference[] = [];
  cache.modify<{ myNotifications: INotificationPageStore }>({
    fields: {
      myNotifications: (page, { isReference }) => {
        if (!isReference(page)) loaded.push(...page.items);
        return page;
      },
    },
  });
  loaded.forEach((item) => writeReadAt(cache, cache.identify(item), readAt));
  updateUnreadCount(cache, () => 0);
}
