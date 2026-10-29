import { completePostMediaUpload, deletePostMedia, requestPostMediaUpload } from '@game-feedback/sdk';

import { uploadMediaFile } from '@/shared/api';

export function uploadMedia(file: File) {
  return uploadMediaFile(file, {
    reserve: requestPostMediaUpload,
    complete: completePostMediaUpload,
    remove: deletePostMedia,
  });
}
