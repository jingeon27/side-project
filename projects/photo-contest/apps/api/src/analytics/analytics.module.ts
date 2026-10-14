import { Module } from '@nestjs/common';

import { ContestCompletionService } from './contest-completion.service';

@Module({
  providers: [ContestCompletionService],
  exports: [ContestCompletionService],
})
export class AnalyticsModule {}
