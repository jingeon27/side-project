import { Module } from '@nestjs/common';

import { GameProfilesModule } from '../game-profiles/game-profiles.module';
import { AppAuthService } from './app-auth.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { SocialIdentityService } from './social-identity.service';

@Module({
  imports: [GameProfilesModule],
  controllers: [AuthController],
  providers: [AuthService, SessionService, AppAuthService, SocialIdentityService],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
