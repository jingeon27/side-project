import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session/session.service';
import { Viewer } from '../auth/session/viewer.decorator';
import { NotificationService } from './notification.service';

@Resolver()
export class NotificationResolver {
  constructor(private readonly notifications: NotificationService) {}

  @Query()
  myNotifications(
    @Viewer() viewer: IViewer,
    @Args('offset') offset?: number | null,
    @Args('limit') limit?: number | null,
  ) {
    return this.notifications.list(viewer, offset, limit);
  }

  @Query()
  notificationUnreadCount(@Viewer() viewer: IViewer) {
    return this.notifications.unreadCount(viewer);
  }

  @Mutation()
  markNotificationRead(@Viewer() viewer: IViewer, @Args('id') id: string) {
    return this.notifications.read(viewer, id);
  }

  @Mutation()
  markAllNotificationsRead(@Viewer() viewer: IViewer) {
    return this.notifications.read(viewer);
  }
}
