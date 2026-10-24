import { Module } from '@nestjs/common';

import { MediaUploadModule } from '../media-upload/media-upload.module';
import { GroupAdministrationResolver } from './group-administration.resolver';
import { GroupAdministrationService } from './group-administration.service';
import { GroupCategoryResolver } from './group-category.resolver';
import { GroupCategoryService } from './group-category.service';
import { GroupJoinRequestResolver } from './group-join-request.resolver';
import { GroupJoinRequestService } from './group-join-request.service';
import { GroupProfileController } from './group-profile.controller';
import { GroupProfileResolver } from './group-profile.resolver';
import { GroupProfileService } from './group-profile.service';
import { GroupResolver } from './group.resolver';
import { GroupService } from './group.service';
import { MembershipModule } from './membership.module';

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
