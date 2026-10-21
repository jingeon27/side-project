import { Module } from '@nestjs/common';

import { PostsModule } from '../posts/posts.module';
import { UsersModule } from '../users/users.module';
import { AnswersController } from './answers.controller';
import { AnswersService } from './answers.service';

@Module({
  imports: [UsersModule, PostsModule],
  controllers: [AnswersController],
  providers: [AnswersService],
  exports: [AnswersService],
})
export class AnswersModule {}
