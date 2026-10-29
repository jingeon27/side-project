import { Module } from '@nestjs/common';

import { NotificationModule } from '../notification/notification.module';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [NotificationModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
