import { Module } from '@nestjs/common';

import { MembershipModule } from '../group/membership/membership.module';
import { ContestNotificationService } from './contest-notification.service';
import { NotificationResolver } from './notification.resolver';
import { NotificationService } from './notification.service';

@Module({
  imports: [MembershipModule],
  providers: [NotificationService, NotificationResolver, ContestNotificationService],
  exports: [ContestNotificationService, NotificationService],
})
export class NotificationModule {}
