import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { GameProfilesModule } from '../game-profiles/game-profiles.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [UsersModule, GameProfilesModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
