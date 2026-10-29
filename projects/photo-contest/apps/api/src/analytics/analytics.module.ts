import { Module } from '@nestjs/common';

import { ContestCompletionService } from './completion/contest-completion.service';

@Module({
  providers: [ContestCompletionService],
  exports: [ContestCompletionService],
})
export class AnalyticsModule {}
