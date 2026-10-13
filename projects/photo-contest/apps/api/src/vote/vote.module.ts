import { Module } from '@nestjs/common';

import { GroupModule } from '../group/group.module';
import { VoteResolver } from './vote.resolver';
import { VoteService } from './vote.service';

@Module({
  imports: [GroupModule],
  providers: [VoteService, VoteResolver],
})
export class VoteModule {}
