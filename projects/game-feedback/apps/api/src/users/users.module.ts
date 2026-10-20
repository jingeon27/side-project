import { Module } from '@nestjs/common';
import { UserVisibilityService } from './user-visibility.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserVisibilityService],
  exports: [UserVisibilityService],
})
export class UsersModule {}
