import { Args, Mutation, Resolver } from '@nestjs/graphql';

import type { IViewer } from '../auth/session.service';
import { OptionalViewer, Viewer } from '../auth/viewer.decorator';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { createInputValidationPipe } from '../common/input-validation';
import {
  CompleteOnboardingSchema,
  CompleteProfileAvatarUploadSchema,
  RequestProfileAvatarUploadSchema,
  UpdateMyProfileSchema,
  type TCompleteOnboardingDto,
  type TCompleteProfileAvatarUploadDto,
  type TRequestProfileAvatarUploadDto,
  type TUpdateMyProfileDto,
} from './profile.dto';
import { ProfileService } from './profile.service';

@Resolver()
export class ProfileResolver {
  constructor(private readonly profiles: ProfileService) {}

  @Mutation()
  requestProfileAvatarUpload(
    @OptionalViewer() viewer: IViewer | null,
    @Args(createInputValidationPipe(RequestProfileAvatarUploadSchema)) input: TRequestProfileAvatarUploadDto,
  ) {
    return this.profiles.requestUpload(
      viewer ?? fail(ERROR_MESSAGE.LOGIN_REQUIRED, ERROR_CODE.UNAUTHENTICATED),
      input,
    );
  }

  @Mutation()
  completeProfileAvatarUpload(
    @OptionalViewer() viewer: IViewer | null,
    @Args(createInputValidationPipe(CompleteProfileAvatarUploadSchema))
    input: TCompleteProfileAvatarUploadDto,
  ) {
    return this.profiles.completeUpload(
      viewer ?? fail(ERROR_MESSAGE.LOGIN_REQUIRED, ERROR_CODE.UNAUTHENTICATED),
      input.uploadId,
    );
  }

  @Mutation()
  completeOnboarding(
    @OptionalViewer() viewer: IViewer | null,
    @Args(createInputValidationPipe(CompleteOnboardingSchema)) input: TCompleteOnboardingDto,
  ) {
    return this.profiles.update(
      viewer ?? fail(ERROR_MESSAGE.LOGIN_REQUIRED, ERROR_CODE.UNAUTHENTICATED),
      input,
      true,
    );
  }

  @Mutation()
  updateMyProfile(
    @Viewer() viewer: IViewer,
    @Args(createInputValidationPipe(UpdateMyProfileSchema)) input: TUpdateMyProfileDto,
  ) {
    return this.profiles.update(viewer, input);
  }
}
