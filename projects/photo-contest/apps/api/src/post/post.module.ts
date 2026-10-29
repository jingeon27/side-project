import { Module } from '@nestjs/common';

import { GroupModule } from '../group/group.module';
import { MediaUploadModule } from '../media-upload/media-upload.module';
import { PostCategoryResolver } from './categories/post-category.resolver';
import { PostCategoryService } from './categories/post-category.service';
import { PostCommentResolver } from './comments/post-comment.resolver';
import { PostCommentService } from './comments/post-comment.service';
import { PostController } from './media/post.controller';
import { PostModerationService } from './moderation/post-moderation.service';
import { PostResolver } from './post.resolver';
import { PostService } from './post.service';

@Module({
  imports: [GroupModule, MediaUploadModule],
  providers: [
    PostCategoryService,
    PostCategoryResolver,
    PostModerationService,
    PostService,
    PostResolver,
    PostCommentService,
    PostCommentResolver,
  ],
  controllers: [PostController],
})
export class PostModule {}
