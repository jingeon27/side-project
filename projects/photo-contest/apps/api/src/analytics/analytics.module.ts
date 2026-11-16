import { Module } from '@nestjs/common';

import { completionReadersProvider } from './completion/completion-readers.provider';
import { ContestCompletionService } from './completion/contest-completion.service';
import { LegacyCompletionReader } from './completion/legacy-completion.reader';
import { PostCompletionReader } from './completion/post-completion.reader';

@Module({
  providers: [
    PostCompletionReader,
    LegacyCompletionReader,
    completionReadersProvider,
    ContestCompletionService,
  ],
  exports: [ContestCompletionService],
})
export class AnalyticsModule {}
