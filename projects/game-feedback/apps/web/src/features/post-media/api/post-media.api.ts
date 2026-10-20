import {
  uploadPostMedia,
  requestPostMediaUpload,
  completePostMediaUpload,
  deletePostMedia,
} from '@game-feedback/sdk';
import { uploadMediaFile } from '@/shared/api';

export function uploadMedia(file: File) {
  return uploadMediaFile(file, {
    reserve: requestPostMediaUpload,
    proxy: () => uploadPostMedia({ file }),
    complete: completePostMediaUpload,
    remove: deletePostMedia,
  });
}
