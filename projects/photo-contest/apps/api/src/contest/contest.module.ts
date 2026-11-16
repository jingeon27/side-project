import { Module } from '@nestjs/common';

import { GroupModule } from '../group/group.module';
import { ContestResolver } from './contest.resolver';
import { ContestService } from './contest.service';
import { GroupContestResolver } from './group-contest/group-contest.resolver';
import { GroupContestService } from './group-contest/group-contest.service';
import { GroupContestsResolver } from './group-contest/group-contests.resolver';

@Module({
  imports: [GroupModule],
  providers: [
    GroupContestService,
    GroupContestResolver,
    ContestService,
    ContestResolver,
    GroupContestsResolver,
  ],
  exports: [ContestService],
})
export class ContestModule {}
