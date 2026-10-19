import { AnalyticsRepository } from './analytics.repository';
import { Module } from '@nestjs/common';

import { ContestCompletionService } from './contest-completion.service';

@Module({
  providers: [AnalyticsRepository, ContestCompletionService],
  exports: [ContestCompletionService],
})
export class AnalyticsModule {}
