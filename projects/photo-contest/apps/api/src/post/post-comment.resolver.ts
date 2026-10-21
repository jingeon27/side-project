import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session.service';
import { OptionalViewer, Viewer } from '../auth/viewer.decorator';
import { PostCommentService } from './post-comment.service';

@Resolver()
export class PostCommentResolver {
  constructor(private readonly comments: PostCommentService) {}

  @Query()
  postComments(
    @OptionalViewer() viewer: IViewer | null,
    @Args('postId') postId: string,
    @Args('offset') offset?: number | null,
    @Args('limit') limit?: number | null,
    @Args('parentId') parentId?: string | null,
  ) {
    return this.comments.list(viewer, postId, offset, limit, parentId);
  }

  @Query()
  postCommentCount(
    @OptionalViewer() viewer: IViewer | null,
    @Args('postId') postId: string,
    @Args('parentId') parentId?: string | null,
  ) {
    return this.comments.count(viewer, postId, parentId);
  }

  @Mutation()
  createPostComment(
    @Viewer() viewer: IViewer,
    @Args('postId') postId: string,
    @Args('body') body: string,
    @Args('parentId') parentId?: string | null,
  ) {
    return this.comments.create(viewer, postId, body, parentId);
  }

  @Mutation()
  deletePostComment(@Viewer() viewer: IViewer, @Args('commentId') commentId: string) {
    return this.comments.delete(viewer, commentId);
  }

  @Mutation()
  likePostComment(@Viewer() viewer: IViewer, @Args('commentId') commentId: string) {
    return this.comments.like(viewer, commentId, true);
  }

  @Mutation()
  unlikePostComment(@Viewer() viewer: IViewer, @Args('commentId') commentId: string) {
    return this.comments.like(viewer, commentId, false);
  }
}
