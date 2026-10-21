import { appRoutes } from '@game-feedback/bridge';

import type { Notification } from '@/shared/api';

export function notificationPath(locale: string, notification: Pick<Notification, 'postId' | 'commentId'>) {
  const post = appRoutes.post(locale, notification.postId);
  return notification.commentId ? `${post}#comment-${encodeURIComponent(notification.commentId)}` : post;
}
