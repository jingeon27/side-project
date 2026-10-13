import { Args, Mutation, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import { VoteService } from './vote.service';

@Resolver('Vote')
export class VoteResolver {
  constructor(private readonly voteService: VoteService) {}

  @Mutation()
  castVote(
    @Viewer() viewer: IViewer,
    @Args('contestId') contestId: string,
    @Args('submissionId') submissionId: string,
  ) {
    return this.voteService.castVote(viewer, contestId, submissionId);
  }
}
