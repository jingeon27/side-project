import { Args, Mutation, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import { GroupProfileService } from './group-profile.service';

@Resolver()
export class GroupProfileResolver {
  constructor(private readonly profiles: GroupProfileService) {}
  @Mutation()
  requestGroupAvatarUpload(
    @Viewer() viewer: IViewer,
    @Args('groupId') groupId: string,
    @Args('contentType') contentType: string,
    @Args('byteSize') byteSize: number,
  ) {
    return this.profiles.requestUpload(viewer, groupId, contentType, byteSize);
  }
  @Mutation()
  completeGroupAvatarUpload(@Viewer() viewer: IViewer, @Args('uploadId') uploadId: string) {
    return this.profiles.completeUpload(viewer, uploadId);
  }
  @Mutation()
  updateGroupProfile(@Viewer() viewer: IViewer, @Args() input: Parameters<GroupProfileService['update']>[1]) {
    return this.profiles.update(viewer, input);
  }
}
