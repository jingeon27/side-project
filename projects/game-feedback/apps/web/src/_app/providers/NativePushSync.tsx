'use client';

import { useEffect } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { BRIDGE_EVENT, parseNativeMessage } from '@game-feedback/bridge';

import { useSession } from '@/features/auth';
import { notificationListOptions, notificationSummaryOptions } from '@/features/notification';
import { synchronizePush, useNativePushSupported } from '@/features/push-notifications';
import { useI18n } from '@/shared/i18n';
import { postToNative } from '@/shared/native';

export function NativePushSync() {
  const { session } = useSession();
  const { locale } = useI18n();
  const supported = useNativePushSupported();
  const userId = session.user?.id;
  const client = useQueryClient();
  const { data } = useQuery({ ...notificationSummaryOptions(userId), enabled: supported && !!userId });
  useEffect(() => {
    if (!supported || (userId && data?.unreadCount === undefined)) return;
    postToNative({ type: 'push-badge', count: userId ? Math.min(9999, data?.unreadCount ?? 0) : 0 });
  }, [supported, userId, data?.unreadCount]);
  useEffect(() => {
    if (!supported || !userId) return;
    const sync = () => {
      void synchronizePush(false, locale).catch(() => undefined);
    };
    sync();
    const receive = (event: Event) => {
      const message = parseNativeMessage((event as CustomEvent<unknown>).detail);
      if (message?.type === 'state' && message.state === 'active') sync();
      if (message?.type !== 'push-received') return;
      sync();
      void client.invalidateQueries(notificationListOptions(userId));
      void client.invalidateQueries({
        predicate: (query) =>
          query.queryKey.includes(userId) &&
          query.queryKey.some((key) => typeof key === 'string' && /conversation|chat/i.test(key)),
      });
    };
    window.addEventListener(BRIDGE_EVENT, receive);
    return () => window.removeEventListener(BRIDGE_EVENT, receive);
  }, [client, supported, userId, locale]);
  return null;
}
