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
    let active = true;
    const receiveResponse = (response: Notifications.NotificationResponse | null) => {
      if (!active || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
        return;
      inbox.tap(response.notification.request.identifier, response.notification.request.content.data?.path);
    };
    const tapped = Notifications.addNotificationResponseReceivedListener(receiveResponse);
    const received = Notifications.addNotificationReceivedListener(inbox.notify);
    const tokenChanged = Notifications.addPushTokenListener(inbox.notify);
    void Notifications.getLastNotificationResponseAsync()
      .then(receiveResponse)
      .catch(() => undefined);
    return () => {
      active = false;
      tapped.remove();
      received.remove();
      tokenChanged.remove();
    };
  }, [inbox]);
}
