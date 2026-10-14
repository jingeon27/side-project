import { Parent, ResolveField, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import type { IGroupNode } from '../group/group.service';
import { ContestService } from './contest.service';

/** Group.contests. 부모 Group 노드는 멤버십을 확인한 경로에서만 만들어진다. */
@Resolver('Group')
export class GroupContestsResolver {
  constructor(private readonly contestService: ContestService) {}

  @ResolveField()
  contests(@Parent() group: IGroupNode, @Viewer() viewer: IViewer) {
    return this.contestService.contestsOfGroup(viewer, group);
  }
}
