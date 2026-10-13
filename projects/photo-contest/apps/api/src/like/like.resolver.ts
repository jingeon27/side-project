import { Args, Mutation, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import { LikeService } from './like.service';

/** 정규화 캐시가 likeCount·likedByMe를 바로 갱신하도록 바뀐 Submission을 돌려준다. */
@Resolver()
export class LikeResolver {
  constructor(private readonly likeService: LikeService) {}

  @Mutation()
  likeSubmission(@Viewer() viewer: IViewer, @Args('submissionId') submissionId: string) {
    return this.likeService.like(viewer, submissionId);
  }

  @Mutation()
  unlikeSubmission(@Viewer() viewer: IViewer, @Args('submissionId') submissionId: string) {
    return this.likeService.unlike(viewer, submissionId);
  }
}
