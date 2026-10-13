import { Module } from '@nestjs/common';

import { GroupResolver } from './group.resolver';
import { GroupService } from './group.service';
import { MembershipService } from './membership.service';

@Module({
  providers: [GroupService, MembershipService, GroupResolver],
  exports: [GroupService, MembershipService],
})
export class GroupModule {}
