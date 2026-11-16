import { StrictMode } from 'react';

import { act, renderHook } from '@testing-library/react';
import * as Notifications from 'expo-notifications';
import { expect, it, vi } from 'vitest';

import { PushInbox } from './push-inbox';
import { usePushEvents } from './use-push-events';

vi.mock('./native-push', () => ({ supportsNativePush: () => true }));
vi.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'default',
  setNotificationHandler: vi.fn(),
  clearLastNotificationResponseAsync: vi.fn(async () => undefined),
  getLastNotificationResponseAsync: vi.fn(async () => null),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  addNotificationReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  addPushTokenListener: vi.fn(() => ({ remove: vi.fn() })),
}));

const response = (id: string): Notifications.NotificationResponse => {
  return {
    actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
    notification: {
      date: 0,
      request: {
        identifier: id,
        trigger: null,
        content: {
          title: null,
          subtitle: null,
          body: null,
          sound: null,
          categoryIdentifier: null,
          badge: null,
          launchImageName: null,
          attachments: [],
          threadIdentifier: null,
          data: { path: '/ko/notifications' },
        },
      },
    },
  };
};

it('discards disposed OS responses while keeping inbox rebinding separate from OS subscription lifetime', async () => {
  const stale = Promise.withResolvers<Notifications.NotificationResponse | null>();
  const current = Promise.withResolvers<Notifications.NotificationResponse | null>();
  vi.mocked(Notifications.getLastNotificationResponseAsync)
    .mockReturnValueOnce(stale.promise)
    .mockReturnValueOnce(current.promise);
  const inbox = new PushInbox();
  const first = { onOpen: vi.fn(() => true), onReceived: vi.fn() };
  const { rerender, unmount } = renderHook(
    ({ onOpen, onReceived }) => usePushEvents(inbox, onOpen, onReceived),
    { initialProps: first, wrapper: StrictMode },
  );
  const listeners = vi.mocked(Notifications.addNotificationResponseReceivedListener);
  const staleListener = listeners.mock.calls[0]?.[0];
  const currentListener = listeners.mock.calls[1]?.[0];
  if (!staleListener || !currentListener) throw new Error('Push listeners missing');
  const latest = { onOpen: vi.fn(() => true), onReceived: vi.fn() };
  rerender(latest);
  expect(listeners).toHaveBeenCalledTimes(2);
  await act(async () => {
    stale.resolve(response('stale-initial'));
    staleListener(response('stale-event'));
    current.resolve(response('current'));
  });
  expect(first.onOpen).not.toHaveBeenCalled();
  expect(latest.onOpen).toHaveBeenCalledExactlyOnceWith('/ko/notifications');
  act(() => currentListener(response('current')));
  expect(latest.onOpen).toHaveBeenCalledOnce();
  unmount();
  for (const listener of [
    Notifications.addNotificationResponseReceivedListener,
    Notifications.addNotificationReceivedListener,
    Notifications.addPushTokenListener,
  ]) {
    for (const result of vi.mocked(listener).mock.results) {
      if (result.type === 'return') expect(result.value.remove).toHaveBeenCalledOnce();
    }
  }
  act(() => currentListener(response('after-unmount')));
  const reopened = vi.fn(() => true);
  inbox.bind(reopened, vi.fn());
  expect(reopened).not.toHaveBeenCalled();
});
