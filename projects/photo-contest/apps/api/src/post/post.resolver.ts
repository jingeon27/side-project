import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session/session.service';
import { OptionalViewer, Viewer } from '../auth/session/viewer.decorator';
import { MediaUploadService } from '../media-upload/media-upload.service';
import { ClientAddress } from '../rate-limit/client-address.decorator';
import { PostFileService } from './media/post-file.service';
import { PostModerationService } from './moderation/post-moderation.service';
import { PostService } from './post.service';

@Resolver()
export class PostResolver {
  constructor(
    private readonly posts: PostService,
    private readonly files: PostFileService,
    private readonly uploads: MediaUploadService,
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
    return this.files.download(viewer, id);
  }
  @Query()
  publicGalleryPosts(
    @OptionalViewer() viewer: IViewer | null,
    @Args() query: Parameters<PostService['listPublic']>[1],
  ) {
    return this.posts.listPublic(viewer, query);
  }
  @Query()
  myGalleryPosts(@Viewer() viewer: IViewer, @Args() query: Parameters<PostService['listMine']>[1]) {
    return this.posts.listMine(viewer, query);
  }
  @Query()
  galleryPosts(@OptionalViewer() viewer: IViewer | null, @Args() query: Parameters<PostService['list']>[1]) {
    return this.posts.list(viewer, query);
  }
  @Mutation()
  requestPostUpload(
    @Viewer() viewer: IViewer,
    @Args('groupId') groupId: string,
    @Args('contentType') contentType: string,
    @Args('byteSize') byteSize: number,
    @ClientAddress() address: string | null,
  ) {
    return this.uploads.requestUpload(viewer, groupId, contentType, byteSize, { kind: 'POST' }, address);
  }
  @Mutation()
  completePostUpload(@Viewer() viewer: IViewer, @Args('uploadId') uploadId: string) {
    return this.uploads.completeUpload(viewer, uploadId);
  }
  @Mutation()
  createPost(
    @Viewer() viewer: IViewer,
    @Args() input: Parameters<PostService['create']>[1],
    @ClientAddress() address: string | null,
  ) {
    return this.posts.create(viewer, input, address);
  }
  @Mutation()
  likePost(@Viewer() viewer: IViewer, @Args('postId') id: string) {
    return this.posts.like(viewer, id, true);
  }
  @Mutation()
  updatePost(@Viewer() viewer: IViewer, @Args() input: Parameters<PostService['update']>[1]) {
    return this.posts.update(viewer, input);
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
