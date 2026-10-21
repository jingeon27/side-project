import { describe, expect, it } from 'vitest';

import { validPostLink, youtubeVideoId } from './post-link.helper';

describe('첨부 링크와 유튜브 재생', () => {
  it('정상적인 유튜브 주소만 동영상 ID로 바꿔야 한다', () => {
    for (const url of [
      'https://youtu.be/abcdefghijk?t=5',
      'https://www.youtube.com/watch?v=abcdefghijk&list=test',
      'https://youtube.com/shorts/abcdefghijk',
      'https://m.youtube.com/live/abcdefghijk',
    ])
      expect(youtubeVideoId(url)).toBe('abcdefghijk');
    for (const url of [
      'https://youtube.com.evil.test/watch?v=abcdefghijk',
      'https://www.youtube.com@evil.test/watch?v=abcdefghijk',
      'https://www.youtube.com/watch?v=bad',
      'https://example.com/abcdefghijk',
      'https://youtu.be/abcdefghijk/extra',
    ])
      expect(youtubeVideoId(url)).toBeNull();
  });
  it('외부 링크는 웹 주소만 허용하고 인증정보나 실행 scheme을 거부해야 한다', () => {
    expect(validPostLink(' https://example.com/path ')).toBe(true);
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,test',
      '//example.com',
      'https://user:password@example.com',
      'https://example.com/' + 'a'.repeat(2048),
    ])
      expect(validPostLink(url)).toBe(false);
  });
});
