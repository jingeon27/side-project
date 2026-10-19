import { AuthRepository } from './auth.repository';
import { Global, Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { PasswordAuthService } from './password-auth.service';
import { SessionService } from './session.service';

// @Viewer() 파이프가 어느 모듈의 리졸버·컨트롤러에서든 SessionService를 주입받도록 전역으로 둔다.
@Global()
@Module({
  providers: [AuthRepository, SessionService, AuthService, PasswordAuthService, AuthResolver],
  controllers: [AuthController],
  exports: [SessionService],
})
export class AuthModule {}
