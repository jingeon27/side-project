import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { InternalPostsController } from './internal-posts.controller';
import { PostMediaUploadService } from './media/post-media-upload.service';
import { PostMediaController, PostMediaUploadGuard } from './media/post-media.controller';
import { PostMediaService } from './media/post-media.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PostViewsService } from './views/post-views.service';

@Module({
  imports: [UsersModule, AuthModule],
  controllers: [PostsController, PostMediaController, InternalPostsController],
  providers: [PostsService, PostViewsService, PostMediaService, PostMediaUploadService, PostMediaUploadGuard],
  exports: [PostsService],
})
export class PostsModule {}
