import { appRoutes } from '@game-feedback/bridge';

import type { Notification } from '@/shared/api';

export function notificationPath(locale: string, notification: Notification) {
  if (notification.type === 'CHAT_MESSAGE')
    return appRoutes.conversation(locale, notification.conversationId);
  const post = appRoutes.post(locale, notification.postId);
  return notification.commentId ? `${post}#comment-${encodeURIComponent(notification.commentId)}` : post;
}
