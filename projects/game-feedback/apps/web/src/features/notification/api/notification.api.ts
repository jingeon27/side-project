import { listNotifications, readAllNotifications, readNotification } from '@game-feedback/sdk';

import type { TNotificationListParams } from '../types/notification.type';

export function fetchNotificationList(params: TNotificationListParams = {}) {
  return listNotifications(params);
}
export function postReadNotification({ id }: { id?: string }) {
  if (id) return readNotification(id);
  return readAllNotifications();
}
