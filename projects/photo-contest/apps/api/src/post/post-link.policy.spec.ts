import { describe, expect, it } from 'vitest';
import { postLink } from './post-link.policy';

describe('게시물 첨부 링크', () => {
  it('빈 첨부는 null이고 웹 주소는 공백을 제거해 저장해야 한다', () => {
    expect(postLink(undefined)).toBeNull();
    expect(postLink('  ')).toBeNull();
    expect(postLink(' https://youtu.be/abcdefghijk ')).toBe('https://youtu.be/abcdefghijk');
    expect(postLink('https://example.com')).toBe('https://example.com/');
  });
  it('실행 가능한 scheme·인증정보·잘못된 주소와 긴 링크를 거부해야 한다', () => {
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,test',
      'file:///tmp/private',
      '//example.com',
      'https://user:password@example.com',
      'https://example.com/' + 'a'.repeat(2048),
    ])
      expect(() => postLink(value)).toThrow('HTTP·HTTPS');
  });
});
