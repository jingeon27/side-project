import { readFile } from 'node:fs/promises';

/** Chromium의 canvas + MediaRecorder로 만든 64px·1초 H.264 MP4. 외부 영상·개인정보 없음. */
export function createTestVideo() {
  return readFile(new URL('../fixtures/clip.mp4', import.meta.url));
}
