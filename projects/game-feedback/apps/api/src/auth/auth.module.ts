import { Module } from '@nestjs/common';
import { AppAuthService } from './app-auth.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, AppAuthService],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
