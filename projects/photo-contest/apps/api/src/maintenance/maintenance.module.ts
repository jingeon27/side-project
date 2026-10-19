import { MaintenanceRepository } from './maintenance.repository';
import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { MaintenanceService } from './maintenance.service';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [AnalyticsModule],
  providers: [MaintenanceRepository, MaintenanceService, SchedulerService],
  exports: [MaintenanceService, SchedulerService],
})
export class MaintenanceModule {}
