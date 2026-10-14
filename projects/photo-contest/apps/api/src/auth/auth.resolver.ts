import { Query, Resolver } from '@nestjs/graphql';

import type { IViewer } from './session.service';
import { OptionalViewer } from './viewer.decorator';

@Resolver()
export class AuthResolver {
  @Query()
  me(@OptionalViewer() viewer: IViewer | null) {
    return viewer;
  }
}
