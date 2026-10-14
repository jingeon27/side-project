import { randomUUID } from 'node:crypto';

const PHOTO_KEY = /^[a-f0-9-]{36}\.webp$/;

/** 저장소 키는 서버가 만든 UUID만 쓴다. 사용자 입력이 경로에 섞이지 않게 한다. */
export function createPhotoKey() {
  return `${randomUUID()}.webp`;
}

export function assertPhotoKey(key: string) {
  if (!PHOTO_KEY.test(key)) throw new Error('Invalid photo key');
  return key;
}
