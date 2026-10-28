import { AvatarUploadInputSchema } from '@game-feedback/contracts';

// 프로필 사진의 형식과 크기는 계약 AvatarUploadInputSchema가 정한다.
const { mimeType, size } = AvatarUploadInputSchema.shape;

/** file input의 accept 값 */
export const avatarAccept = mimeType.options.join(',');

export function isAvatarFile(file: File) {
  return mimeType.safeParse(file.type).success && size.safeParse(file.size).success;
}
