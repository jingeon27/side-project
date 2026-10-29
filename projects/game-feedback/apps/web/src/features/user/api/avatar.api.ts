import { AvatarUploadInputSchema } from '@game-feedback/contracts';
import {
  completeProfileAvatarUpload,
  deleteProfileAvatarUpload,
  requestProfileAvatarUpload,
} from '@game-feedback/sdk';

import { uploadMediaFile } from '@/shared/api';

import { prepareAvatar } from '../lib/prepare-avatar';

export async function uploadAvatar(file: File) {
  const image = await prepareAvatar(file);
  return uploadMediaFile(image, {
    reserve: (input) => requestProfileAvatarUpload(AvatarUploadInputSchema.parse(input)),
    complete: completeProfileAvatarUpload,
    remove: deleteProfileAvatarUpload,
  });
}
