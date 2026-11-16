import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';

import { ERROR_CODE } from '../common/errors';
import type { IGraphqlContext } from '../common/graphql/graphql-context';
import { createInputValidationPipe } from '../common/input-validation';
import { AnonymousAuthService } from './anonymous/anonymous-auth.service';
import { PasswordAttemptGuard } from './password/auth-attempt.guard';
import {
  LoginWithPasswordSchema,
  RegisterWithPasswordSchema,
  type TLoginWithPasswordDto,
  type TRegisterWithPasswordDto,
} from './password/auth.dto';
import { PasswordAuthService } from './password/password-auth.service';
import type { IViewer } from './session/session.service';
import { OptionalViewer } from './session/viewer.decorator';

@Resolver()
export class AuthResolver {
  constructor(
    private readonly passwords: PasswordAuthService,
    private readonly anonymous: AnonymousAuthService,
  ) {}

  @Mutation()
  startAnonymousSession(@Context() { req, res }: IGraphqlContext) {
    return this.anonymous.start(req, res);
  }

  @Mutation()
  @UseGuards(PasswordAttemptGuard)
  registerWithPassword(
    @Args(createInputValidationPipe(RegisterWithPasswordSchema)) input: TRegisterWithPasswordDto,
    @Context() { req, res }: IGraphqlContext,
  ) {
    return this.passwords.register(input, req, res);
  }

  @Mutation()
  @UseGuards(PasswordAttemptGuard)
  loginWithPassword(
    @Args(createInputValidationPipe(LoginWithPasswordSchema, ERROR_CODE.UNAUTHENTICATED))
    input: TLoginWithPasswordDto,
    @Context() { req, res }: IGraphqlContext,
  ) {
    return this.passwords.login(input, req, res);
  }

  @Query()
  me(@OptionalViewer() viewer: IViewer | null) {
    return viewer;
  }
}
