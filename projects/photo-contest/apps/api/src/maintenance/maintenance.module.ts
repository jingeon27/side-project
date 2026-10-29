import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { NotificationModule } from '../notification/notification.module';
import { MaintenanceService } from './maintenance.service';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [AnalyticsModule, NotificationModule],
  providers: [MaintenanceService, SchedulerService],
  exports: [MaintenanceService, SchedulerService],
})
export class MaintenanceModule {}
