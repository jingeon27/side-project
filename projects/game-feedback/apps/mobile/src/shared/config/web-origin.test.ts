import { describe, expect, it } from 'vitest';

import { parseWebOrigin } from './web-origin';

describe('설정한 웹 origin 정규화', () => {
  it.each([
    ['https://Feedback.Example', 'https://feedback.example'],
    ['https://feedback.example:443', 'https://feedback.example'],
    ['https://FEEDBACK.example:443', 'https://feedback.example'],
    ['https://feedback.example:8443', 'https://feedback.example:8443'],
  ])('%s를 WebView가 보고하는 origin %s로 맞춘다', (value, expected) => {
    expect(parseWebOrigin(value, false)).toBe(expected);
  });

  it('개발용 HTTP origin도 기본 포트를 생략하고 범위를 벗어난 포트는 거부한다', () => {
    expect(parseWebOrigin('http://LocalHost:80', true)).toBe('http://localhost');
    expect(parseWebOrigin('http://localhost:3300', true)).toBe('http://localhost:3300');
    expect(() => parseWebOrigin('https://feedback.example:99999', false)).toThrow();
  });
});
