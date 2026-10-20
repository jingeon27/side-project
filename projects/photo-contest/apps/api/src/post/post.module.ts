import { Module } from '@nestjs/common';

import { GroupModule } from '../group/group.module';
import { MediaProcessor } from './media-processor';
import { PostCommentResolver } from './post-comment.resolver';
import { PostCommentService } from './post-comment.service';
import { PostController } from './post.controller';
import { PostResolver } from './post.resolver';
import { PostService } from './post.service';

@Module({
  imports: [GroupModule],
  providers: [PostService, PostResolver, PostCommentService, PostCommentResolver, MediaProcessor],
  controllers: [PostController],
})
export class PostModule {}
