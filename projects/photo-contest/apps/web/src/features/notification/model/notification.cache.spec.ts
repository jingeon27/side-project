import { InMemoryCache } from '@apollo/client';
import { describe, expect, it } from 'vitest';

import {
  MyNotificationsDocument,
  NotificationType,
  NotificationUnreadCountDocument,
  type MyNotificationsQuery,
} from '@/shared/api/generated';

import { markAllNotificationsReadInCache, markNotificationReadInCache } from './notification.cache';
import { notificationTypePolicies } from './notification.type-policies';

const READ_AT = '2026-10-27T00:00:00.000Z';

function notice(id: string, readAt: string | null = null) {
  return {
    __typename: 'ActivityNotification' as const,
    id,
    type: NotificationType.PostComment,
    groupId: 'group-1',
    groupName: '웃음 그룹',
    postId: null,
    postTitle: null,
    commentId: null,
    parentCommentId: null,
    contestId: null,
    contestTitle: null,
    contestFormat: null,
    joinRequestId: null,
    actorNickname: null,
    readAt,
    createdAt: '2026-10-26T00:00:00.000Z',
  };
}

function seed(items: MyNotificationsQuery['myNotifications']['items'], unreadCount: number) {
  const cache = new InMemoryCache({ typePolicies: notificationTypePolicies });
  cache.writeQuery({
    query: MyNotificationsDocument,
    variables: { offset: 0, limit: 2 },
    data: {
      myNotifications: {
        __typename: 'NotificationPage',
        items: items.slice(0, 2),
        unreadCount,
        hasMore: true,
      },
    },
  });
  cache.writeQuery({
    query: MyNotificationsDocument,
    variables: { offset: 2, limit: 2 },
    data: {
      myNotifications: { __typename: 'NotificationPage', items: items.slice(2), unreadCount, hasMore: false },
    },
  });
  cache.writeQuery({
    query: NotificationUnreadCountDocument,
    data: { notificationUnreadCount: unreadCount },
  });
  return cache;
}

function read(cache: InMemoryCache) {
  const page = cache.readQuery({ query: MyNotificationsDocument, variables: { offset: 0, limit: 2 } });
  return {
    ids: page?.myNotifications.items.map(({ id }) => id),
    unread: page?.myNotifications.items.filter(({ readAt }) => !readAt).map(({ id }) => id),
    unreadCount: page?.myNotifications.unreadCount,
    badge: cache.readQuery({ query: NotificationUnreadCountDocument })?.notificationUnreadCount,
  };
}

describe('알림 캐시 helper', () => {
  it('하나를 읽으면 그 알림만 읽음으로 바꾸고 두 개수를 하나씩 줄이며 불러온 페이지를 유지해야 한다', () => {
    const cache = seed([notice('a'), notice('b'), notice('c'), notice('d', READ_AT)], 3);
    markNotificationReadInCache(cache, 'c', READ_AT);
    expect(read(cache)).toEqual({ ids: ['a', 'b', 'c', 'd'], unread: ['a', 'b'], unreadCount: 2, badge: 2 });
  });

  it('이미 읽은 알림을 다시 열면 개수를 줄이지 않아야 한다', () => {
    const cache = seed([notice('a'), notice('b', READ_AT)], 1);
    markNotificationReadInCache(cache, 'b', '2026-10-28T00:00:00.000Z');
    expect(read(cache)).toMatchObject({ unread: ['a'], unreadCount: 1, badge: 1 });
  });

  it('모두 읽으면 불러온 알림을 모두 읽음으로 바꾸고 개수를 0으로 만들어야 한다', () => {
    const cache = seed([notice('a'), notice('b'), notice('c', READ_AT), notice('d')], 30);
    markAllNotificationsReadInCache(cache, READ_AT);
    expect(read(cache)).toEqual({ ids: ['a', 'b', 'c', 'd'], unread: [], unreadCount: 0, badge: 0 });
  });
});
