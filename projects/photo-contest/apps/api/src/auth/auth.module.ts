import { Global, Module } from '@nestjs/common';

import { AnonymousAuthService } from './anonymous/anonymous-auth.service';
import { AuthController } from './auth.controller';
import { AuthResolver } from './auth.resolver';
import { PasswordAttemptGuard } from './password/auth-attempt.guard';
import { PasswordAuthService } from './password/password-auth.service';
import { SessionService } from './session/session.service';
import { UserResolver } from './user.resolver';

// @Viewer() 파이프가 어느 모듈의 리졸버·컨트롤러에서든 SessionService를 주입받도록 전역으로 둔다.
@Global()
@Module({
  providers: [
    PasswordAttemptGuard,
    SessionService,
    PasswordAuthService,
    AnonymousAuthService,
    AuthResolver,
    UserResolver,
  ],
  controllers: [AuthController],
  exports: [SessionService],
})
export class AuthModule {}
