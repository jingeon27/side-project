import { describe, expect, it } from 'vitest';

import { mediaDownloadDisposition, mediaDownloadFilename } from './media-download.policy';

describe('다운로드 파일명', () => {
  it('제목의 경로·제어 문자를 제거하고 실제 저장 파일의 확장자를 사용해야 한다', () => {
    expect(mediaDownloadFilename('../웃긴:사진\r\n?', 'uuid.webp')).toBe('웃긴사진.webp');
    expect(mediaDownloadFilename('...', 'uuid.mp4')).toBe('피식.mp4');
  });
  it('한글·이모지 파일명을 RFC 5987로 보내고 헤더에 원문 줄바꿈을 넣지 않아야 한다', () => {
    const name = mediaDownloadFilename('웃긴 순간 😀', 'uuid.webm');
    const disposition = mediaDownloadDisposition(name);
    expect(disposition).toContain('filename="byeolsadae.webm"');
    expect(decodeURIComponent(disposition.split("filename*=UTF-8''")[1] ?? '')).toBe(name);
    expect(disposition).not.toMatch(/[\r\n]/);
  });
});
