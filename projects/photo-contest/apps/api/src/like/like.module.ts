import { Module } from '@nestjs/common';

import { GroupModule } from '../group/group.module';
import { SubmissionModule } from '../submission/submission.module';
import { LikeResolver } from './like.resolver';
import { LikeService } from './like.service';

@Module({
  imports: [GroupModule, SubmissionModule],
  providers: [LikeService, LikeResolver],
})
export class LikeModule {}
