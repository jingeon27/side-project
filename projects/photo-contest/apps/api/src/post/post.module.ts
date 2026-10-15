import { Module } from '@nestjs/common';

import { GroupModule } from '../group/group.module';
import { MediaProcessor } from './media-processor';
import { PostController } from './post.controller';
import { PostResolver } from './post.resolver';
import { PostService } from './post.service';

@Module({
  imports: [GroupModule],
  providers: [PostService, PostResolver, MediaProcessor],
  controllers: [PostController],
})
export class PostModule {}
