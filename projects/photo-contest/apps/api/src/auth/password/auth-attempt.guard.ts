import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import type { IGraphqlContext } from '../../common/graphql/graphql-context';
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
