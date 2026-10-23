import { Args, Mutation, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session.service';
import { OptionalViewer, Viewer } from '../auth/viewer.decorator';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import {
  CompleteOnboardingDto,
  CompleteProfileAvatarUploadDto,
  RequestProfileAvatarUploadDto,
  UpdateMyProfileDto,
} from './profile.dto';
import { ProfileService } from './profile.service';

@Resolver()
export class ProfileResolver {
  constructor(private readonly profiles: ProfileService) {}

  @Mutation()
  requestProfileAvatarUpload(
    @OptionalViewer() viewer: IViewer | null,
    @Args() input: RequestProfileAvatarUploadDto,
  ) {
    return this.profiles.requestUpload(
      viewer ?? fail(ERROR_MESSAGE.LOGIN_REQUIRED, ERROR_CODE.UNAUTHENTICATED),
      input,
    );
  }

  @Mutation()
  completeProfileAvatarUpload(
    @OptionalViewer() viewer: IViewer | null,
    @Args() input: CompleteProfileAvatarUploadDto,
  ) {
    return this.profiles.completeUpload(
      viewer ?? fail(ERROR_MESSAGE.LOGIN_REQUIRED, ERROR_CODE.UNAUTHENTICATED),
      input.uploadId,
    );
  }

  @Mutation()
  completeOnboarding(@OptionalViewer() viewer: IViewer | null, @Args() input: CompleteOnboardingDto) {
    return this.profiles.update(
      viewer ?? fail(ERROR_MESSAGE.LOGIN_REQUIRED, ERROR_CODE.UNAUTHENTICATED),
      input,
      true,
    );
  }

  @Mutation()
  updateMyProfile(@Viewer() viewer: IViewer, @Args() input: UpdateMyProfileDto) {
    return this.profiles.update(viewer, input);
  }
}
