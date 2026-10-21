import { Args, Mutation, Resolver } from '@nestjs/graphql';
import type { FileUpload } from 'graphql-upload/processRequest.mjs';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import { GroupProfileService } from './group-profile.service';

@Resolver()
export class GroupProfileResolver {
  constructor(private readonly profiles: GroupProfileService) {}
  @Mutation()
  uploadGroupAvatar(
    @Viewer() viewer: IViewer,
    @Args('groupId') groupId: string,
    @Args('file') file: Promise<FileUpload>,
  ) {
    return this.profiles.upload(viewer, groupId, file);
  }
  @Mutation()
  updateGroupProfile(@Viewer() viewer: IViewer, @Args() input: Parameters<GroupProfileService['update']>[1]) {
    return this.profiles.update(viewer, input);
  }
}
