import { Module } from '@nestjs/common';

import { AccountWithdrawalService } from './account-withdrawal.service';
import { AppAuthService } from './app-auth.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { SocialIdentityService } from './social-identity.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, AppAuthService, SocialIdentityService, AccountWithdrawalService],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
