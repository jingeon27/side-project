import { unstable_getResponseFromNextConfig } from 'next/experimental/testing/server';

import { describe, expect, it } from 'vitest';

import nextConfig from './next.config';

const respond = (url: string) => unstable_getResponseFromNextConfig({ url, nextConfig });

describe('next.config 보안 헤더', () => {
  it('모든 화면에 프레임 삽입·형식 추측·리퍼러·권한 정책을 붙여야 한다', async () => {
    for (const url of ['https://contest.example/', 'https://contest.example/invite/abc']) {
      const { headers } = await respond(url);
      expect(headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(headers.get('x-content-type-options')).toBe('nosniff');
      expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(headers.get('permissions-policy')).toContain('camera=()');
      const csp = headers.get('content-security-policy') ?? '';
      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("frame-src 'self' https://www.youtube-nocookie.com");
      expect(csp).not.toContain('unsafe-eval');
    }
  });

  it('저장소 업로드·미디어·Sentry·Amplitude 전송 출처는 막지 않아야 한다', async () => {
    const csp =
      (await respond('https://contest.example/groups/g1')).headers.get('content-security-policy') ?? '';
    expect(csp).not.toMatch(/(^|;\s*)(default-src|connect-src|img-src|media-src)\b/);
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('X-Powered-By로 프레임워크를 알리지 않아야 한다', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
