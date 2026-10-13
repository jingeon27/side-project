import { Module } from '@nestjs/common';

import { AnalyticsDeliveryService } from './analytics-delivery.service';
import { ContestCompletionService } from './contest-completion.service';

@Module({
  providers: [AnalyticsDeliveryService, ContestCompletionService],
  exports: [AnalyticsDeliveryService, ContestCompletionService],
})
export class AnalyticsModule {}
