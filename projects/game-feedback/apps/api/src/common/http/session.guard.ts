import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import { requireAdmin, requireProfileLookupSession, requireUser } from '../../auth/session-access';
import type { SessionRequest } from '../../auth/session.types';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { ApiError } from './api-error';

export class UserGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    requireUser(context.switchToHttp().getRequest<SessionRequest>());
    return true;
  }
}
export class ProfileLookupGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    requireProfileLookupSession(context.switchToHttp().getRequest<SessionRequest>());
    return true;
  }
}
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    requireAdmin(context.switchToHttp().getRequest<SessionRequest>());
    return true;
  }
}
@Injectable()
export class TestAuthGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}
  canActivate() {
    if (!this.config.testAuthEnabled || this.config.production)
      throw new ApiError(404, 'NOT_FOUND', '존재하지 않는 기능입니다.');
    return true;
  }
}
@Injectable()
export class DemoAuthGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}
  canActivate() {
    if (!this.config.demoMode) throw new ApiError(404, 'NOT_FOUND', '존재하지 않는 기능입니다.');
    return true;
  }
}
