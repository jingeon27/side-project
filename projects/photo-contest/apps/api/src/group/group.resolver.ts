import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session.service';
import { OptionalViewer, Viewer } from '../auth/viewer.decorator';
import { GroupService } from './group.service';
import type { IGroupNode } from './group.service';

// Group.contests는 그룹이 대회 모듈에 의존하지 않도록 contest 모듈의 GroupContestsResolver가 해석한다.
@Resolver('Group')
export class GroupResolver {
  constructor(private readonly groups: GroupService) {}

  @Query()
  myGroups(@Viewer() viewer: IViewer) {
    return this.groups.myGroups(viewer);
  }

  @Query()
  group(@Viewer() viewer: IViewer, @Args('id') id: string) {
    return this.groups.group(viewer, id);
  }

  @Query()
  invitePreview(@OptionalViewer() viewer: IViewer | null, @Args('token') token: string) {
    return this.groups.invitePreview(viewer, token);
  }

  @Mutation()
  createGroup(@Viewer() viewer: IViewer, @Args('name') name: string) {
    return this.groups.createGroup(viewer, name);
  }

  @Mutation()
  joinGroup(@Viewer() viewer: IViewer, @Args('token') token: string) {
    return this.groups.joinGroup(viewer, token);
  }

  @Mutation()
  regenerateInviteLink(@Viewer() viewer: IViewer, @Args('groupId') groupId: string) {
    return this.groups.regenerateInviteLink(viewer, groupId);
  }

  @ResolveField()
  members(@Parent() group: IGroupNode) {
    return group.loadMembers();
  }

  @ResolveField()
  leaderboard(@Parent() group: IGroupNode) {
    return this.groups.leaderboard(group.id);
  }
}
