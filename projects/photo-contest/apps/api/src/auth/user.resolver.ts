import { Parent, ResolveField, Resolver } from '@nestjs/graphql';

import type { IUserView } from './user-view';

@Resolver('User')
export class UserResolver {
  @ResolveField()
  isAnonymous(@Parent() user: IUserView) {
    return user.provider === 'anonymous';
  }

  @ResolveField()
  needsOnboarding(@Parent() user: IUserView) {
    return user.needsOnboarding ?? false;
  }

  @ResolveField()
  avatar(@Parent() user: IUserView): string | null {
    // 직접 올린 사진이 있으면 고정 S3 경로를 쓰고, 그 전에는 기존 프로필 사진을 쓴다.
    return user.avatarUploadId ? `/backend/profiles/${user.id}/avatar/${user.avatarUploadId}` : user.avatar;
  }
}
