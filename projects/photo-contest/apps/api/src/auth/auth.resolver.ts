import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { IGraphqlContext } from '../common/graphql/graphql-context';
import { AnonymousAuthService } from './anonymous-auth.service';
import { PasswordAttemptGuard } from './auth-attempt.guard';
import { LoginWithPasswordDto, RegisterWithPasswordDto } from './auth.dto';
import { PasswordAuthService } from './password-auth.service';
import type { IViewer } from './session.service';
import { OptionalViewer } from './viewer.decorator';

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
  registerWithPassword(@Args() input: RegisterWithPasswordDto, @Context() { req, res }: IGraphqlContext) {
    return this.passwords.register(input, req, res);
  }

  @Mutation()
  @UseGuards(PasswordAttemptGuard)
  loginWithPassword(@Args() input: LoginWithPasswordDto, @Context() { req, res }: IGraphqlContext) {
    return this.passwords.login(input, req, res);
  }

  @Query()
  me(@OptionalViewer() viewer: IViewer | null) {
    return viewer;
  }
}
