import { MediaUploadInputSchema } from '@game-feedback/contracts';

// 게시글·채팅에 올릴 수 있는 형식과 크기는 계약 MediaUploadInputSchema가 정한다.
const { mimeType, size } = MediaUploadInputSchema.shape;

/** file input의 accept 값 */
export const mediaAccept = {
  all: mimeType.options.join(','),
  image: mimeType.options.filter((type) => type.startsWith('image/')).join(','),
  video: mimeType.options.filter((type) => type.startsWith('video/')).join(','),
};

export function isUploadableMediaType(type: string) {
  return mimeType.safeParse(type).success;
}

export function isUploadableMediaSize(bytes: number) {
  return size.safeParse(bytes).success;
}
