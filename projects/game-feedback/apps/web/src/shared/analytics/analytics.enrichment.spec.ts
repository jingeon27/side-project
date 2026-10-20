import { describe, expect, it } from 'vitest';
import { analyticsContext, scrubAnalyticsProperties, viewportBucket } from './analytics.enrichment';
describe('Amplitude 공통 속성', () => {
  it('중첩된 attribution 사용자 속성에서도 검색어를 지워야 한다', () => {
    expect(
      scrubAnalyticsProperties({
        $set: {
          referrer: 'https://site.test/?secret=value',
          initial_referrer: 'https://user:pass@site.test/path?q=private',
        },
      }),
    ).toEqual({ $set: { referrer: 'https://site.test/', initial_referrer: 'https://site.test/path' } });
  });
  it('페이지 ID 없이 화면 이름·언어·기기 너비·호스트를 구분해야 한다', () => {
    expect(
      analyticsContext({ pathname: '/ko/posts/private-id', width: 390, locale: 'en', native: true }),
    ).toEqual({ screen: 'post', locale: 'ko', viewport_bucket: '360-479', client: 'webview' });
  });
  it('각 화면 너비 경계를 구분해야 한다', () =>
    expect([359, 360, 479, 480, 767, 768, 1023, 1024].map(viewportBucket)).toEqual([
      '<360',
      '360-479',
      '360-479',
      '480-767',
      '480-767',
      '768-1023',
      '768-1023',
      '1024+',
    ]));
  it('자동 페이지뷰와 폼 목적지에 검색어·fragment·제목을 싣지 않아야 한다', () => {
    const result = scrubAnalyticsProperties({
      '[Amplitude] Page Location': 'https://site.test/ko/search?q=private#secret',
      '[Amplitude] Page Title': 'private',
      '[Amplitude] Form Destination': '/api/auth?code=private',
      provider: 'google',
    });
    expect(result).toEqual({
      '[Amplitude] Page Location': 'https://site.test/ko/search',
      '[Amplitude] Form Destination': '/api/auth',
      provider: 'google',
    });
  });
});
