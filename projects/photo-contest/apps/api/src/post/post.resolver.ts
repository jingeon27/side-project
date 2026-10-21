import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { FileUpload } from 'graphql-upload/processRequest.mjs';

import type { IViewer } from '../auth/session.service';
import { OptionalViewer, Viewer } from '../auth/viewer.decorator';
import { PostModerationService } from './post-moderation.service';
import { PostService } from './post.service';

@Resolver()
export class PostResolver {
  constructor(
    private readonly posts: PostService,
    private readonly moderation: PostModerationService,
  ) {}
  @Query()
  galleryPost(@OptionalViewer() viewer: IViewer | null, @Args('id') id: string) {
    return this.posts.find(viewer, id);
  }
  @Query()
  hiddenGalleryPosts(
    @Viewer() viewer: IViewer,
    @Args('groupId') groupId: string,
    @Args('offset') offset: number,
    @Args('limit') limit: number,
  ) {
    return this.moderation.hidden(viewer, groupId, offset, limit);
  }
  @Mutation()
  setPostHidden(@Viewer() viewer: IViewer, @Args('postId') postId: string, @Args('hidden') hidden: boolean) {
    return this.moderation.setHidden(viewer, postId, hidden);
  }
  @Query()
  postDownload(@OptionalViewer() viewer: IViewer | null, @Args('postId') id: string) {
    return this.posts.download(viewer, id);
  }
  @Query()
  publicGalleryPosts(
    @OptionalViewer() viewer: IViewer | null,
    @Args() query: Parameters<PostService['listPublic']>[1],
  ) {
    return this.posts.listPublic(viewer, query);
  }
  @Query()
  galleryPosts(@OptionalViewer() viewer: IViewer | null, @Args() query: Parameters<PostService['list']>[1]) {
    return this.posts.list(viewer, query);
  }
  @Mutation()
  uploadPostMedia(
    @Viewer() viewer: IViewer,
    @Args('uploadId') uploadId: string,
    @Args('file') file: Promise<FileUpload>,
  ) {
    return this.posts.uploadFile(viewer, uploadId, file);
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
