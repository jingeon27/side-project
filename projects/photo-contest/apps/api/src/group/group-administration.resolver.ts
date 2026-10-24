import { Args, Mutation, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import { GroupAdministrationService } from './group-administration.service';

@Resolver()
export class GroupAdministrationResolver {
  constructor(private readonly administration: GroupAdministrationService) {}

  @Mutation()
  setGroupModerator(
    @Viewer() viewer: IViewer,
    @Args('groupId') groupId: string,
    @Args('userId') userId: string,
    @Args('enabled') enabled: boolean,
  ) {
    return this.administration.setModerator(viewer, groupId, userId, enabled);
  }

  @Mutation()
  removeGroupMember(
    @Viewer() viewer: IViewer,
    @Args('groupId') groupId: string,
    @Args('userId') userId: string,
  ) {
    return this.administration.removeMember(viewer, groupId, userId);
  }

  @Mutation()
  leaveGroup(@Viewer() viewer: IViewer, @Args('groupId') groupId: string) {
    return this.administration.leave(viewer, groupId);
  }

  @Mutation()
  transferGroupOwnership(
    @Viewer() viewer: IViewer,
    @Args('groupId') groupId: string,
    @Args('userId') userId: string,
  ) {
    return this.administration.transferOwnership(viewer, groupId, userId);
  }
}
