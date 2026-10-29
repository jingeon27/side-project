import { useEffect } from 'react';

import * as Notifications from 'expo-notifications';

import { supportsNativePush } from './native-push';
import type { PushInbox } from './push-inbox';

export function usePushEvents(inbox: PushInbox, onOpen: (path: string) => boolean, onReceived: () => void) {
  useEffect(() => inbox.bind(onOpen, onReceived), [inbox, onOpen, onReceived]);
  useEffect(() => {
    if (!supportsNativePush()) return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    });
    inbox.bindConsumed(async () => {
      try {
        await Notifications.clearLastNotificationResponseAsync();
      } catch {
        // 이미 연 알림은 inbox의 중복 방지 기록으로 보호한다.
      }
    });
    const lifetime = new AbortController();
    const handleResponse = (response: Notifications.NotificationResponse | null) => {
      if (
        lifetime.signal.aborted ||
        !response ||
        response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
      )
        return;
      inbox.tap(response.notification.request.identifier, response.notification.request.content.data?.path);
    };
    const tapped = Notifications.addNotificationResponseReceivedListener(handleResponse);
    const received = Notifications.addNotificationReceivedListener(inbox.notify);
    const tokenChanged = Notifications.addPushTokenListener(inbox.notify);
    const handleInitialResponse = async () => {
      try {
        handleResponse(await Notifications.getLastNotificationResponseAsync());
      } catch {
        // 초기 응답 조회 실패 후에도 실시간 알림 구독은 유지한다.
      }
    };
    void handleInitialResponse();
    return () => {
      lifetime.abort();
      tapped.remove();
      received.remove();
      tokenChanged.remove();
    };
  }, [inbox]);
}
