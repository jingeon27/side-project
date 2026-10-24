import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [NotificationsModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
