import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import { isAdmin } from '../group/group-role';
import { phase } from './contest.policy';
import { ContestService, type IContestNode, type ICreateContestInput } from './contest.service';

@Resolver('Contest')
export class ContestResolver {
  constructor(private readonly contestService: ContestService) {}

  @Query()
  contest(@Viewer() viewer: IViewer, @Args('id') id: string) {
    return this.contestService.contest(viewer, id);
  }

  @Query()
  contestResults(@Viewer() viewer: IViewer, @Args('contestId') contestId: string) {
    return this.contestService.results(viewer, contestId);
  }

  @Mutation()
  createContest(@Viewer() viewer: IViewer, @Args() input: ICreateContestInput) {
    return this.contestService.createContest(viewer, input);
  }

  @ResolveField('phase')
  currentPhase(@Parent() contest: IContestNode) {
    return phase(contest);
  }

  @ResolveField()
  isAdmin(@Parent() contest: IContestNode) {
    return isAdmin({ role: contest.viewerRole });
  }

  @ResolveField()
  async mySubmissionId(@Parent() contest: IContestNode) {
    return (await contest.loadViewerStats()).mySubmissionId;
  }

  @ResolveField()
  async votedSubmissionId(@Parent() contest: IContestNode) {
    return (await contest.loadViewerStats()).votedSubmissionId;
  }

  @ResolveField()
  async submissionCount(@Parent() contest: IContestNode) {
    return (await contest.loadViewerStats()).submissionCount;
  }

  @ResolveField()
  hiddenSubmissions(@Parent() contest: IContestNode) {
    return contest.loadHiddenSubmissions();
  }
}
