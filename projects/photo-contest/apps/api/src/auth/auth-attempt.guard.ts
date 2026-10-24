import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { ERROR_CODE, fail } from '../common/errors';
import type { IGraphqlContext } from '../common/graphql/graphql-context';
import { developmentLoginEnabled } from '../config/env';
import { PasswordAuthService } from './password-auth.service';

@Injectable()
export class PasswordAttemptGuard implements CanActivate {
  constructor(private readonly passwords: PasswordAuthService) {}

  async canActivate(context: ExecutionContext) {
    const graphql = GqlExecutionContext.create(context);
    const { req } = graphql.getContext<IGraphqlContext>();
    const kind = context.getHandler().name === 'registerWithPassword' ? 'register' : 'login';
    // DTO가 잘못된 요청도 반복 시도 한도에 포함한다.
    await this.passwords.consumeRequest(kind, req);
    return true;
  }
}

@Injectable()
export class DevelopmentLoginGuard implements CanActivate {
  canActivate() {
    if (!developmentLoginEnabled()) fail('개발 로그인이 비활성화되어 있습니다.', ERROR_CODE.FORBIDDEN);
    return true;
  }
}
