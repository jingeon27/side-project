import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';
import { PostMediaUploadService } from './media/post-media-upload.service';
import { PostMediaController, PostMediaUploadGuard } from './media/post-media.controller';
import { PostMediaService } from './media/post-media.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PostViewsService } from './views/post-views.service';

@Module({
  imports: [UsersModule],
  controllers: [PostsController, PostMediaController],
  providers: [PostsService, PostViewsService, PostMediaService, PostMediaUploadService, PostMediaUploadGuard],
  exports: [PostsService],
})
export class PostsModule {}
