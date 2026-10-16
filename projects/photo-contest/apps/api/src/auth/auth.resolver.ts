import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';

import type { IGraphqlContext } from '../common/graphql/graphql-context';
import { PasswordAuthService } from './password-auth.service';
import type { IViewer } from './session.service';
import { OptionalViewer } from './viewer.decorator';

@Resolver()
export class AuthResolver {
  constructor(private readonly passwords: PasswordAuthService) {}

  @Mutation()
  registerWithPassword(
    @Args() input: { loginId: string; password: string; nickname: string },
    @Context() { req, res }: IGraphqlContext,
  ) {
    return this.passwords.register(input, req, res);
  }

  @Mutation()
  loginWithPassword(
    @Args() input: { loginId: string; password: string },
    @Context() { req, res }: IGraphqlContext,
  ) {
    return this.passwords.login(input, req, res);
  }

  @Query()
  me(@OptionalViewer() viewer: IViewer | null) {
    return viewer;
  }
}
