import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';

@Module({
  imports: [UsersModule],
  controllers: [FollowsController],
  providers: [FollowsService],
})
export class FollowsModule {}
