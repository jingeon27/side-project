import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PostMediaController, PostMediaUploadGuard } from './post-media.controller';
import { PostMediaService } from './post-media.service';
import { PostViewsService } from './post-views.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [UsersModule],
  controllers: [PostsController, PostMediaController],
  providers: [PostsService, PostViewsService, PostMediaService, PostMediaUploadGuard],
  exports: [PostsService],
})
export class PostsModule {}
