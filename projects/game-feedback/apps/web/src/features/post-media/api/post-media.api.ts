import { uploadPostMedia } from '@game-feedback/sdk';
import { ApiError, withApiError } from '@/shared/api';

export function uploadMedia(file: File) {
  if (
    !['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'].includes(file.type) ||
    file.size <= 0 ||
    file.size > 25 * 1024 * 1024
  )
    throw new ApiError(400, 'INVALID_MEDIA', '사진이나 동영상을 25MB 이하로 선택해주세요.');
  return withApiError(uploadPostMedia({ file }));
}
