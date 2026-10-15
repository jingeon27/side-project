import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import { PostService } from './post.service';

@Resolver()
export class PostResolver {
  constructor(private readonly posts: PostService) {}
  @Query()
  galleryPosts(@Viewer() viewer: IViewer, @Args() query: Parameters<PostService['list']>[1]) {
    return this.posts.list(viewer, query);
  }
  @Mutation()
  requestPostUpload(@Viewer() viewer: IViewer, @Args('groupId') groupId: string) {
    return this.posts.requestUpload(viewer, groupId);
  }
  @Mutation()
  createPost(@Viewer() viewer: IViewer, @Args() input: Parameters<PostService['create']>[1]) {
    return this.posts.create(viewer, input);
  }
  @Mutation()
  likePost(@Viewer() viewer: IViewer, @Args('postId') id: string) {
    return this.posts.like(viewer, id, true);
  }
  @Mutation()
  unlikePost(@Viewer() viewer: IViewer, @Args('postId') id: string) {
    return this.posts.like(viewer, id, false);
  }
  @Mutation()
  deletePost(@Viewer() viewer: IViewer, @Args('postId') id: string) {
    return this.posts.delete(viewer, id);
  }
}
