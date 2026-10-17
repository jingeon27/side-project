import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import { PostCommentService } from './post-comment.service';

@Resolver()
export class PostCommentResolver {
  constructor(private readonly comments: PostCommentService) {}

  @Query()
  postComments(
    @Viewer() viewer: IViewer,
    @Args('postId') postId: string,
    @Args('offset') offset?: number | null,
    @Args('limit') limit?: number | null,
  ) {
    return this.comments.list(viewer, postId, offset, limit);
  }

  @Mutation()
  createPostComment(@Viewer() viewer: IViewer, @Args('postId') postId: string, @Args('body') body: string) {
    return this.comments.create(viewer, postId, body);
  }

  @Mutation()
  deletePostComment(@Viewer() viewer: IViewer, @Args('commentId') commentId: string) {
    return this.comments.delete(viewer, commentId);
  }
}
