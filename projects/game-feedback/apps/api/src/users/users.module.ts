import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { Module } from '@nestjs/common';
import { UserVisibilityService } from './user-visibility.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, ProfileController],
  providers: [UsersService, UserVisibilityService, ProfileService],
  exports: [UserVisibilityService],
})
export class UsersModule {}
