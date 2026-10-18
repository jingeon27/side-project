import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PostMediaService } from './post-media.service';
import { PostMediaController, PostMediaUploadGuard } from './post-media.controller';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PostViewsService } from './post-views.service';

@Module({
  imports: [UsersModule],
  controllers: [PostsController, PostMediaController],
  providers: [PostsService, PostViewsService, PostMediaService, PostMediaUploadGuard],
  exports: [PostsService],
})
export class PostsModule {}
