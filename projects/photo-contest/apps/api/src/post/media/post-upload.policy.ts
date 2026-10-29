import { fail } from '../../common/errors';
import { MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES } from '../../config/limits';
import type { TMediaExtension } from '../../storage/media-storage.service';

interface IPostMediaPolicy {
  extension: TMediaExtension;
  kind: 'PHOTO' | 'VIDEO';
  maxBytes: number;
}

const MEDIA_TYPES = {
  'image/jpeg': { extension: 'jpg', kind: 'PHOTO', maxBytes: MAX_UPLOAD_BYTES },
  'image/png': { extension: 'png', kind: 'PHOTO', maxBytes: MAX_UPLOAD_BYTES },
  'image/webp': { extension: 'webp', kind: 'PHOTO', maxBytes: MAX_UPLOAD_BYTES },
  'video/mp4': { extension: 'mp4', kind: 'VIDEO', maxBytes: MAX_VIDEO_BYTES },
  'video/webm': { extension: 'webm', kind: 'VIDEO', maxBytes: MAX_VIDEO_BYTES },
} as const satisfies Record<string, IPostMediaPolicy>;
export type TMediaType = keyof typeof MEDIA_TYPES;

export function postUploadPolicy(contentType: string, byteSize: number) {
  if (!Object.hasOwn(MEDIA_TYPES, contentType)) fail('JPEG, PNG, WebP, MP4 또는 WebM 파일을 선택해 주세요.');
  const policy = MEDIA_TYPES[contentType as TMediaType];
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > policy.maxBytes)
    fail(policy.kind === 'PHOTO' ? '사진은 10MB 이하로 올려 주세요.' : '동영상은 100MB 이하로 올려 주세요.');
  return policy;
}
