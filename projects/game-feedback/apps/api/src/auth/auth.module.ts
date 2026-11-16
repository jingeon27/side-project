import { Module } from '@nestjs/common';

import { GameProfilesModule } from '../game-profiles/game-profiles.module';
import { AccountWithdrawalService } from './account/account-withdrawal.service';
import { SocialIdentityService } from './account/social-identity.service';
import { AppAuthService } from './app-login/app-auth.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IdentityProviderRegistry, identityProvidersProvider } from './oauth/identity-provider.registry';
import { SessionService } from './session/session.service';

@Module({
  imports: [GameProfilesModule],
  controllers: [AuthController],
  providers: [
    identityProvidersProvider,
    IdentityProviderRegistry,
    AuthService,
    SessionService,
    AppAuthService,
    SocialIdentityService,
    AccountWithdrawalService,
  ],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
