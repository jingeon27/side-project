import { UsersRepository } from './users.repository';
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserVisibilityService } from './user-visibility.service';

@Module({
  controllers: [UsersController],
  providers: [UsersRepository, UsersService, UserVisibilityService],
  exports: [UserVisibilityService],
})
export class UsersModule {}
