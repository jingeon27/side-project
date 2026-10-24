import { Global, Module } from '@nestjs/common';

import { AnonymousAuthService } from './anonymous-auth.service';
import { DevelopmentLoginGuard, PasswordAttemptGuard } from './auth-attempt.guard';
import { AuthController } from './auth.controller';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { PasswordAuthService } from './password-auth.service';
import { SessionService } from './session.service';
import { UserResolver } from './user.resolver';

// @Viewer() 파이프가 어느 모듈의 리졸버·컨트롤러에서든 SessionService를 주입받도록 전역으로 둔다.
@Global()
@Module({
  providers: [
    PasswordAttemptGuard,
    DevelopmentLoginGuard,
    SessionService,
    AuthService,
    PasswordAuthService,
    AnonymousAuthService,
    AuthResolver,
    UserResolver,
  ],
  controllers: [AuthController],
  exports: [SessionService],
})
export class AuthModule {}
