import { fail } from '../../common/errors';
import { MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES, POST_MEDIA_SIDE_MAX } from '../../config/limits';
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

function isMediaSide(value: number | null | undefined): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= POST_MEDIA_SIDE_MAX
  );
}

/** 브라우저가 잰 가로·세로. 화면 틀 비율에만 쓰므로 모르면 둘 다 비우고, 하나만 오거나 범위를 벗어나면 거절한다. */
export function postMediaSize(width: number | null | undefined, height: number | null | undefined) {
  if (width == null && height == null) return null;
  if (!isMediaSide(width) || !isMediaSide(height))
    fail('사진이나 동영상의 크기를 확인하지 못했어요. 다시 선택해 주세요.');
  return { width, height };
}

export function postUploadPolicy(contentType: string, byteSize: number) {
  if (!Object.hasOwn(MEDIA_TYPES, contentType)) fail('JPEG, PNG, WebP, MP4 또는 WebM 파일을 선택해 주세요.');
  const policy = MEDIA_TYPES[contentType as TMediaType];
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > policy.maxBytes)
    fail(policy.kind === 'PHOTO' ? '사진은 10MB 이하로 올려 주세요.' : '동영상은 100MB 이하로 올려 주세요.');
  return policy;
}
