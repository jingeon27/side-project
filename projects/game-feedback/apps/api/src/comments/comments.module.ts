import { CommentsRepository } from './comments.repository';
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PostsModule } from '../posts/posts.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [UsersModule, PostsModule],
  controllers: [CommentsController],
  providers: [CommentsRepository, CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
