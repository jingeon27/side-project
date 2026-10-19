import { GroupRepository } from './group.repository';
import { GroupAdministrationService } from './group-administration.service';
import { GroupAdministrationResolver } from './group-administration.resolver';
import { Module } from '@nestjs/common';

import { GroupResolver } from './group.resolver';
import { GroupService } from './group.service';
import { GroupJoinRequestResolver } from './group-join-request.resolver';
import { GroupJoinRequestService } from './group-join-request.service';
import { MembershipService } from './membership.service';

@Module({
  providers: [
    GroupRepository,
    GroupAdministrationService,
    GroupAdministrationResolver,
    GroupService,
    MembershipService,
    GroupResolver,
    GroupJoinRequestService,
    GroupJoinRequestResolver,
  ],
  exports: [GroupService, MembershipService],
})
export class GroupModule {}
