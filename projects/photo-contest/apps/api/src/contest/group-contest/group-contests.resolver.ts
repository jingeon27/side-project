import { Parent, ResolveField, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../../auth/session/session.service';
import { Viewer } from '../../auth/session/viewer.decorator';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../../common/errors';
import type { IGroupNode } from '../../group/group.service';
import { ContestService } from '../contest.service';

/** 기존 대회는 그룹 게시물의 공개 여부와 별개로 멤버에게만 제공한다. */
@Resolver('Group')
export class GroupContestsResolver {
  constructor(private readonly contestService: ContestService) {}

  @ResolveField()
  contests(@Parent() group: IGroupNode, @Viewer() viewer: IViewer) {
    if (!group.role) fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
    return this.contestService.contestsOfGroup(viewer, { id: group.id, role: group.role });
  }
}
