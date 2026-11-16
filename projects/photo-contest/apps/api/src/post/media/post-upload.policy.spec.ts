import { describe, expect, it } from 'vitest';

import { MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES, POST_MEDIA_SIDE_MAX } from '../../config/limits';
import { postMediaSize, postUploadPolicy } from './post-upload.policy';

function rejected(message: string) {
  return expect.objectContaining({ message, code: 'BAD_USER_INPUT' });
}

describe('postUploadPolicy', () => {
  it.each([
    ['image/jpeg', 1, 'jpg', 'PHOTO'],
    ['image/png', MAX_UPLOAD_BYTES, 'png', 'PHOTO'],
    ['image/webp', MAX_UPLOAD_BYTES, 'webp', 'PHOTO'],
    ['video/mp4', MAX_VIDEO_BYTES, 'mp4', 'VIDEO'],
    ['video/webm', 1, 'webm', 'VIDEO'],
  ] as const)('%s %s바이트는 %s 확장자의 %s로 받아야 한다', (contentType, byteSize, extension, kind) => {
    expect(postUploadPolicy(contentType, byteSize)).toMatchObject({ extension, kind });
  });

  it.each(['text/plain', 'image/svg+xml', 'image/gif', 'toString'])(
    '허용하지 않은 형식 %s는 거절해야 한다',
    (contentType) => {
      expect(() => postUploadPolicy(contentType, 1)).toThrow(
        rejected('JPEG, PNG, WebP, MP4 또는 WebM 파일을 선택해 주세요.'),
      );
    },
  );

  it.each([
    ['image/png', 0, '사진은 10MB 이하로 올려 주세요.'],
    ['image/png', -1, '사진은 10MB 이하로 올려 주세요.'],
    ['image/png', 1.5, '사진은 10MB 이하로 올려 주세요.'],
    ['image/png', MAX_UPLOAD_BYTES + 1, '사진은 10MB 이하로 올려 주세요.'],
    ['video/mp4', 0, '동영상은 100MB 이하로 올려 주세요.'],
    ['video/mp4', MAX_VIDEO_BYTES + 1, '동영상은 100MB 이하로 올려 주세요.'],
  ])('%s %s바이트는 종류별 크기 안내와 함께 거절해야 한다', (contentType, byteSize, message) => {
    expect(() => postUploadPolicy(contentType, byteSize)).toThrow(rejected(message));
  });
});

describe('postMediaSize', () => {
  it('둘 다 비우면 크기 없이, 1부터 상한까지의 정수 쌍은 그대로 받아야 한다', () => {
    expect(postMediaSize(null, null)).toBeNull();
    expect(postMediaSize(undefined, undefined)).toBeNull();
    expect(postMediaSize(1, 1)).toEqual({ width: 1, height: 1 });
    expect(postMediaSize(POST_MEDIA_SIDE_MAX, POST_MEDIA_SIDE_MAX)).toEqual({
      width: POST_MEDIA_SIDE_MAX,
      height: POST_MEDIA_SIDE_MAX,
    });
  });

  it.each([
    [0, 180],
    [320, 0],
    [POST_MEDIA_SIDE_MAX + 1, 180],
    [320, POST_MEDIA_SIDE_MAX + 1],
    [-320, 180],
    [320.5, 180],
    [Number.NaN, 180],
    [320, null],
    [null, 180],
    [undefined, 180],
  ])('가로 %s·세로 %s처럼 범위를 벗어나거나 한쪽만 보낸 크기는 거절해야 한다', (width, height) => {
    expect(() => postMediaSize(width, height)).toThrow(
      rejected('사진이나 동영상의 크기를 확인하지 못했어요. 다시 선택해 주세요.'),
    );
  });
});
