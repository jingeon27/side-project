import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InternalVisibilityController } from './internal-visibility.controller';
import { UserVisibilityService } from './user-visibility.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, ProfileController, InternalVisibilityController],
  providers: [UsersService, UserVisibilityService, ProfileService],
  exports: [UserVisibilityService],
})
export class UsersModule {}
