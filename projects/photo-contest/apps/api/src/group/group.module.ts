import { Module } from '@nestjs/common';

import { GroupResolver } from './group.resolver';
import { GroupService } from './group.service';
import { GroupJoinRequestResolver } from './group-join-request.resolver';
import { GroupJoinRequestService } from './group-join-request.service';
import { MembershipService } from './membership.service';

@Module({
  providers: [
    GroupService,
    MembershipService,
    GroupResolver,
    GroupJoinRequestService,
    GroupJoinRequestResolver,
  ],
  exports: [GroupService, MembershipService],
})
export class GroupModule {}
