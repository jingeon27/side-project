import { Module } from '@nestjs/common';

import { GroupModule } from '../group/group.module';
import { MediaUploadModule } from '../media-upload/media-upload.module';
import { PostCategoryResolver } from './post-category.resolver';
import { PostCategoryService } from './post-category.service';
import { PostCommentResolver } from './post-comment.resolver';
import { PostCommentService } from './post-comment.service';
import { PostModerationService } from './post-moderation.service';
import { PostController } from './post.controller';
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
