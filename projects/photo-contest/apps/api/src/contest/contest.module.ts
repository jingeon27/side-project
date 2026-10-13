import { Module } from '@nestjs/common';

import { GroupModule } from '../group/group.module';
import { ContestResolver } from './contest.resolver';
import { ContestService } from './contest.service';
import { GroupContestsResolver } from './group-contests.resolver';

@Module({
  imports: [GroupModule],
  providers: [ContestService, ContestResolver, GroupContestsResolver],
  exports: [ContestService],
})
export class ContestModule {}
