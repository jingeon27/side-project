import type { Reference, TypePolicies } from '@apollo/client/cache';

interface INotificationPageStore {
  items: readonly Reference[];
  unreadCount: number;
  hasMore: boolean;
}

export const notificationTypePolicies: TypePolicies = {
  Query: {
    fields: {
      myNotifications: {
        keyArgs: false,
        merge(existing: INotificationPageStore | undefined, incoming: INotificationPageStore, { args }) {
          const offset = typeof args?.offset === 'number' ? args.offset : 0;
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
};
