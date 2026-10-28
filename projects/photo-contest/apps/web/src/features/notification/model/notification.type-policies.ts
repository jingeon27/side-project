import type { Reference, TypePolicies } from '@apollo/client/cache';

interface INotificationPageStore {
  items: readonly Reference[];
  unreadCount: number;
  hasMore: boolean;
}

export const notificationTypePolicies = {
  Query: {
    fields: {
      myNotifications: {
        keyArgs: false,
        merge(existing: INotificationPageStore | undefined, incoming: INotificationPageStore, { args }) {
          const offset = typeof args?.offset === 'number' ? args.offset : 0;
          // 새 알림이 앞에 붙으면 offset이 밀리므로 첫 페이지는 목록을 새로 시작한다. 읽음 처리는 목록을 다시 받지 않고
          // notification.cache helper로 고쳐 더 읽은 페이지를 지우지 않는다.
          if (!offset) return incoming;
          const items = existing?.items.slice() ?? [];
          incoming.items.forEach((item, index) => {
            items[offset + index] = item;
          });
          return { ...incoming, items };
        },
      },
    },
  },
} satisfies TypePolicies;
