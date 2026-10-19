import { mutationOptions } from '@tanstack/react-query';
import { uploadMedia } from '../api/post-media.api';

export function uploadPostMediaMutationOptions(userId?: string) {
  return mutationOptions({ mutationKey: ['post-media', userId, 'upload'], mutationFn: uploadMedia });
}
