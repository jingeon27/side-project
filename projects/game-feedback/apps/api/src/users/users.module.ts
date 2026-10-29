import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProfileController } from './profile/profile.controller';
import { ProfileService } from './profile/profile.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { InternalVisibilityController } from './visibility/internal-visibility.controller';
import { UserVisibilityService } from './visibility/user-visibility.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, ProfileController, InternalVisibilityController],
  providers: [UsersService, UserVisibilityService, ProfileService],
  exports: [UserVisibilityService],
})
export class UsersModule {}
