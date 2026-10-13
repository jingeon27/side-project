import { describe, expect, it } from 'vitest';

import { buildServerRequestHeaders, getServerApiUrl, getWebOrigin } from './server-request.helper';

describe('buildServerRequestHeaders', () => {
  it('들어온 요청의 Cookie 헤더를 손대지 않고 그대로 넘겨야 한다', () => {
    const cookie = 'contest_session=abc%3D%3D; theme=light';
    const headers = buildServerRequestHeaders(
      { 'content-type': 'application/json' },
      { cookie, webOrigin: 'http://localhost:3200' },
    );
    expect(headers.get('cookie')).toBe(cookie);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('origin')).toBe('http://localhost:3200');
    expect(headers.get('apollo-require-preflight')).toBe('true');
  });

  it('쿠키가 없으면 Cookie 헤더를 보내지 않아야 한다', () => {
    const headers = buildServerRequestHeaders(
      { cookie: 'stale=1' },
      { cookie: null, webOrigin: 'http://a.test' },
    );
    expect(headers.has('cookie')).toBe(false);
  });
});

describe('server env', () => {
  it('API 주소와 웹 origin을 환경 변수에서 읽고 없으면 개발 기본값을 써야 한다', () => {
    expect(getServerApiUrl({ API_URL: 'http://127.0.0.1:4320/' })).toBe('http://127.0.0.1:4320');
    expect(getServerApiUrl({})).toBe('http://127.0.0.1:4200');
    expect(getWebOrigin({ WEB_ORIGIN: 'https://contest.example/path' })).toBe('https://contest.example');
    expect(getWebOrigin({})).toBe('http://localhost:3200');
  });
});
