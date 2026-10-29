'use client';

import { useEffect, useEffectEvent } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { BRIDGE_EVENT, parseNativeMessage } from '@game-feedback/bridge';

import { useSession } from '@/features/auth';
import { notificationListOptions, notificationSummaryOptions } from '@/features/notification';
import { synchronizePush, useNativePushSupported } from '@/features/push-notifications';
import { useI18n, type TLocale } from '@/shared/i18n';
import { postToNative } from '@/shared/native';

function requestPushSync(locale: TLocale) {
  void synchronizePush(false, locale).catch(() => undefined);
}

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
  // 기기 등록에 locale이 실리므로 언어가 바뀌면 다시 등록한다.
  useEffect(() => {
    if (!supported || !userId) return;
    requestPushSync(locale);
  }, [supported, userId, locale]);
  // 수신 처리는 그 시점의 사용자·locale·client를 읽는다. 언어가 바뀌어도 브리지 구독을 다시 걸지 않는다.
  const handleNativeMessage = useEffectEvent((event: Event) => {
    if (!supported || !userId) return;
    const message = parseNativeMessage((event as CustomEvent<unknown>).detail);
    if (message?.type === 'state' && message.state === 'active') requestPushSync(locale);
    if (message?.type !== 'push-received') return;
    requestPushSync(locale);
    void client.invalidateQueries(notificationListOptions(userId));
    void client.invalidateQueries({
      predicate: (query) =>
        query.queryKey.includes(userId) &&
        query.queryKey.some((key) => typeof key === 'string' && /conversation|chat/i.test(key)),
    });
  });
  useEffect(() => {
    if (!supported || !userId) return;
    window.addEventListener(BRIDGE_EVENT, handleNativeMessage);
    return () => window.removeEventListener(BRIDGE_EVENT, handleNativeMessage);
  }, [supported, userId]);
  return null;
}
