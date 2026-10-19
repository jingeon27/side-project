import { AuthRepository } from './auth.repository';
import { Module } from '@nestjs/common';
import { AppAuthService } from './app-auth.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { SocialIdentityService } from './social-identity.service';

@Module({
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, SessionService, AppAuthService, SocialIdentityService],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
