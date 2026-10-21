import { Module } from '@nestjs/common';
import { GroupAdministrationResolver } from './group-administration.resolver';
import { GroupAdministrationService } from './group-administration.service';
import { GroupCategoryResolver } from './group-category.resolver';
import { GroupCategoryService } from './group-category.service';

import { GroupJoinRequestResolver } from './group-join-request.resolver';
import { GroupJoinRequestService } from './group-join-request.service';
import { GroupResolver } from './group.resolver';
import { GroupService } from './group.service';
import { MembershipService } from './membership.service';
import { GroupProfileService } from './group-profile.service';
import { GroupProfileResolver } from './group-profile.resolver';
import { GroupProfileController } from './group-profile.controller';

@Module({
  controllers: [GroupProfileController],
  providers: [
    GroupProfileService,
    GroupProfileResolver,
    GroupCategoryService,
    GroupCategoryResolver,
    GroupAdministrationService,
    GroupAdministrationResolver,
    GroupService,
    MembershipService,
    GroupResolver,
    GroupJoinRequestService,
    GroupJoinRequestResolver,
  ],
  exports: [GroupCategoryService, GroupService, MembershipService],
})
export class GroupModule {}
