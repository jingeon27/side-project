import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PostMediaService } from './post-media.service';
import { PostMediaController, PostMediaUploadGuard } from './post-media.controller';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [UsersModule],
  controllers: [PostsController, PostMediaController],
  providers: [PostsService, PostMediaService, PostMediaUploadGuard],
  exports: [PostsService],
})
export class PostsModule {}
