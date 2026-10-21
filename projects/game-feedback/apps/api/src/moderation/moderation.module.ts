import { Module } from '@nestjs/common';

import { AnswersModule } from '../answers/answers.module';
import { CommentsModule } from '../comments/comments.module';
import { PostsModule } from '../posts/posts.module';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  imports: [PostsModule, AnswersModule, CommentsModule],
  controllers: [ModerationController],
  providers: [ModerationService],
})
export class ModerationModule {}
