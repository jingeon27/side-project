import { unstable_getResponseFromNextConfig } from 'next/experimental/testing/server';

import { describe, expect, it } from 'vitest';

import nextConfig from './next.config';

const respond = (url: string) => unstable_getResponseFromNextConfig({ url, nextConfig });

describe('next.config 보안 헤더', () => {
  it('모든 경로에 공통 보안 헤더를 적용해야 한다', async () => {
    for (const path of ['/', '/sign', '/groups/1', '/missing/route']) {
      const { headers } = await respond(`https://contest.example${path}`);
      expect(headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
      expect(headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    }
  });
});
