import { act, renderHook } from '@testing-library/react';
import * as Notifications from 'expo-notifications';
import { describe, expect, it, vi } from 'vitest';

import { PushInbox } from './push-inbox';
import { usePushEvents } from './use-push-events';

vi.mock('./native-push', () => ({ supportsNativePush: () => true }));
vi.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'default',
  setNotificationHandler: vi.fn(),
  clearLastNotificationResponseAsync: vi.fn(async () => {}),
  getLastNotificationResponseAsync: vi.fn(),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  addNotificationReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  addPushTokenListener: vi.fn(() => ({ remove: vi.fn() })),
}));

function response(): Notifications.NotificationResponse {
  return {
    actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
    notification: {
      date: 0,
      request: {
        identifier: 'notification-1',
        trigger: null,
        content: {
          title: null,
          subtitle: null,
          body: null,
          categoryIdentifier: null,
          sound: null,
          launchImageName: null,
          badge: null,
          attachments: [],
          threadIdentifier: null,
          data: { path: '/notifications' },
        },
      },
    },
  };
}

describe('usePushEvents', () => {
  it('마지막 알림 복원 전에 unmount되면 경로를 열지 않고 OS 구독도 제거해야 한다', async () => {
    const restored = Promise.withResolvers<Notifications.NotificationResponse | null>();
    vi.mocked(Notifications.getLastNotificationResponseAsync).mockReturnValue(restored.promise);
    const onOpen = vi.fn(() => true);
    const onReceived = vi.fn();
    const inbox = new PushInbox();
    const { unmount } = renderHook(() => usePushEvents(inbox, onOpen, onReceived));
    unmount();
    await act(async () => restored.resolve(response()));
    expect(onOpen).not.toHaveBeenCalled();
    expect(Notifications.clearLastNotificationResponseAsync).not.toHaveBeenCalled();
    expect(
      vi.mocked(Notifications.addNotificationResponseReceivedListener).mock.results[0]?.value.remove,
    ).toHaveBeenCalledOnce();
    expect(
      vi.mocked(Notifications.addNotificationReceivedListener).mock.results[0]?.value.remove,
    ).toHaveBeenCalledOnce();
    expect(
      vi.mocked(Notifications.addPushTokenListener).mock.results[0]?.value.remove,
    ).toHaveBeenCalledOnce();
  });

  it('복원 실패 후에도 실시간 알림을 열고 소비한 응답을 정리해야 한다', async () => {
    vi.mocked(Notifications.getLastNotificationResponseAsync).mockRejectedValue(new Error('restore failed'));
    const onOpen = vi.fn(() => true);
    const onReceived = vi.fn();
    const inbox = new PushInbox();
    renderHook(() => usePushEvents(inbox, onOpen, onReceived));
    await act(async () => undefined);
    act(() =>
      vi.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0]?.[0](response()),
    );
    expect(onOpen).toHaveBeenCalledWith('/notifications');
    expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalledOnce();
  });
});
