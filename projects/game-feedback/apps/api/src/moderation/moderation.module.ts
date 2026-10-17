import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { PostsModule } from '../posts/posts.module';
import { AnswersModule } from '../answers/answers.module';
import { CommentsModule } from '../comments/comments.module';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  imports: [ChatModule, PostsModule, AnswersModule, CommentsModule],
  controllers: [ModerationController],
  providers: [ModerationService],
})
export class ModerationModule {}
