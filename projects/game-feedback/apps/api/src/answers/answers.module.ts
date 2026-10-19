import { AnswersRepository } from './answers.repository';
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PostsModule } from '../posts/posts.module';
import { AnswersController } from './answers.controller';
import { AnswersService } from './answers.service';

@Module({
  imports: [UsersModule, PostsModule],
  controllers: [AnswersController],
  providers: [AnswersRepository, AnswersService],
  exports: [AnswersService],
})
export class AnswersModule {}
