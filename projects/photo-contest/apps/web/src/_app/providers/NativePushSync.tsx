'use client';

import { useEffect } from 'react';

import { useApolloClient, useQuery } from '@apollo/client/react';

import { synchronizePush } from '@/features/push-notifications';
import { MeDocument, NotificationUnreadCountDocument } from '@/shared/api/generated';
import { useBridge, useNativeApp } from '@/shared/model/bridge';

export function NativePushSync() {
  const bridge = useBridge();
  const app = useNativeApp();
  const supported = !!app && !!bridge?.supports('notifications.registration');
  const client = useApolloClient();
  const { data: session } = useQuery(MeDocument);
  const userId = session?.me && !session.me.needsOnboarding ? session.me.id : undefined;
  const { data } = useQuery(NotificationUnreadCountDocument, {
    skip: !supported || !userId,
    ssr: false,
    pollInterval: 15_000,
  });
  useEffect(() => {
    if (!supported || !bridge || (userId && data?.notificationUnreadCount === undefined)) return;
    void bridge
      .request('notifications.badge', {
        count: userId ? Math.min(9999, data?.notificationUnreadCount ?? 0) : 0,
      })
      .catch(() => undefined);
  }, [supported, bridge, userId, data?.notificationUnreadCount]);
  useEffect(() => {
    if (!supported || !bridge || !userId) return;
    const sync = () => {
      void synchronizePush(bridge, false).catch(() => undefined);
    };
    sync();
    const stopActive = bridge.onEvent('app.state', ({ state }) => {
      if (state === 'active') sync();
    });
    const stopReceived = bridge.onEvent('notifications.received', () => {
      sync();
      void client.refetchQueries({ include: 'active' }).catch(() => undefined);
    });
    return () => {
      stopActive();
      stopReceived();
    };
  }, [supported, bridge, userId, client]);
  return null;
}
