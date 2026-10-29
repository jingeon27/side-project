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
    inbox.bindConsumed(() => {
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    });
    const lifetime = new AbortController();
    const handleNotificationResponse = (response: Notifications.NotificationResponse | null) => {
      if (
        lifetime.signal.aborted ||
        !response ||
        response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
      )
        return;
      inbox.tap(response.notification.request.identifier, response.notification.request.content.data?.path);
    };
    const tapped = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    const received = Notifications.addNotificationReceivedListener(inbox.notify);
    const tokenChanged = Notifications.addPushTokenListener(inbox.notify);
    const restoreResponse = async () => {
      try {
        handleNotificationResponse(await Notifications.getLastNotificationResponseAsync());
      } catch {
        // 마지막 알림 복원 실패는 실시간 구독을 막지 않는다.
      }
    };
    void restoreResponse();
    return () => {
      lifetime.abort();
      tapped.remove();
      received.remove();
      tokenChanged.remove();
    };
  }, [inbox]);
}
