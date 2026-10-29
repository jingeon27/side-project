import { Module } from '@nestjs/common';

import { MediaUploadModule } from '../media-upload/media-upload.module';
import { GroupAdministrationResolver } from './administration/group-administration.resolver';
import { GroupAdministrationService } from './administration/group-administration.service';
import { GroupCategoryResolver } from './categories/group-category.resolver';
import { GroupCategoryService } from './categories/group-category.service';
import { GroupResolver } from './group.resolver';
import { GroupService } from './group.service';
import { GroupJoinRequestResolver } from './membership/group-join-request.resolver';
import { GroupJoinRequestService } from './membership/group-join-request.service';
import { MembershipModule } from './membership/membership.module';
import { GroupProfileController } from './profile/group-profile.controller';
import { GroupProfileResolver } from './profile/group-profile.resolver';
import { GroupProfileService } from './profile/group-profile.service';

@Module({
  imports: [MembershipModule, MediaUploadModule],
  controllers: [GroupProfileController],
  providers: [
    GroupProfileService,
    GroupProfileResolver,
    GroupCategoryService,
    GroupCategoryResolver,
    GroupAdministrationService,
    GroupAdministrationResolver,
    GroupService,
    GroupResolver,
    GroupJoinRequestService,
    GroupJoinRequestResolver,
  ],
  exports: [GroupCategoryService, GroupService, MembershipModule],
})
export class GroupModule {}
