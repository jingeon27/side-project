import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../../auth/session/session.service';
import { Viewer } from '../../auth/session/viewer.decorator';
import { GroupJoinRequestService } from './group-join-request.service';

@Resolver()
export class GroupJoinRequestResolver {
  constructor(private readonly requests: GroupJoinRequestService) {}

  @Query()
  groupJoinRequests(
    @Viewer() viewer: IViewer,
    @Args('groupId') groupId: string,
    @Args('offset') offset?: number | null,
    @Args('limit') limit?: number | null,
  ) {
    return this.requests.list(viewer, groupId, offset, limit);
  }

  @Mutation()
  approveGroupJoinRequest(@Viewer() viewer: IViewer, @Args('requestId') requestId: string) {
    return this.requests.review(viewer, requestId, true);
  }

  @Mutation()
  rejectGroupJoinRequest(@Viewer() viewer: IViewer, @Args('requestId') requestId: string) {
    return this.requests.review(viewer, requestId, false);
  }
}
