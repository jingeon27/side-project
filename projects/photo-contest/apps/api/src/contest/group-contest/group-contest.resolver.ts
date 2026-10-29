import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../../auth/session/session.service';
import { OptionalViewer, Viewer } from '../../auth/session/viewer.decorator';
import { GroupContestService, type IGroupContestNode } from './group-contest.service';

@Resolver('GroupContest')
export class GroupContestResolver {
  constructor(private readonly contests: GroupContestService) {}

  @Query()
  groupContests(
    @OptionalViewer() viewer: IViewer | null,
    @Args() input: Parameters<GroupContestService['list']>[1],
  ) {
    return this.contests.list(viewer, input);
  }
  @Query()
  groupContest(@OptionalViewer() viewer: IViewer | null, @Args('id') id: string) {
    return this.contests.get(viewer, id);
  }
  @Query()
  groupContestResults(@OptionalViewer() viewer: IViewer | null, @Args('contestId') contestId: string) {
    return this.contests.results(viewer, contestId);
  }
  @Query()
  publicGroupContestCount() {
    return this.contests.publicCount();
  }
  @Query()
  publicGroupContests(@Args('offset') offset?: number | null, @Args('limit') limit?: number | null) {
    return this.contests.publicList(offset, limit);
  }
  @Mutation()
  createGroupContest(@Viewer() viewer: IViewer, @Args() input: Parameters<GroupContestService['create']>[1]) {
    return this.contests.create(viewer, input);
  }
  @Mutation()
  castGroupContestVote(
    @Viewer() viewer: IViewer,
    @Args('contestId') contestId: string,
    @Args('postId') postId: string,
  ) {
    return this.contests.vote(viewer, contestId, postId);
  }
  @ResolveField()
  winners(@Parent() contest: IGroupContestNode) {
    return contest.loadWinners();
  }
}
