import { unstable_getResponseFromNextConfig } from 'next/experimental/testing/server';

import { describe, expect, it } from 'vitest';

import nextConfig from './next.config';

const respond = (url: string) => unstable_getResponseFromNextConfig({ url, nextConfig });

describe('next.config 앱 링크', () => {
  it('앱 로그인 콜백만 공통 헤더에서 빼 Route Handler의 엄격한 CSP·no-referrer가 그대로 나가야 한다', async () => {
    for (const url of [
      'https://contest.example/app-auth/callback',
      'https://contest.example/app-auth/callback?code=x',
    ]) {
      const { headers } = await respond(url);
      expect(headers.get('content-security-policy'), url).toBeNull();
      expect(headers.get('referrer-policy'), url).toBeNull();
    }
    for (const url of [
      'https://contest.example/app-auth/callbackx',
      'https://contest.example/app-auth/callback/extra',
      'https://contest.example/.well-known/assetlinks.json',
    ])
      expect((await respond(url)).headers.get('x-frame-options'), url).toBe('SAMEORIGIN');
  });

  it('표준 /.well-known 경로를 kebab-case 앱 링크 라우트로 다시 써야 한다', async () => {
    const association = await respond('https://contest.example/.well-known/apple-app-site-association');
    expect(association.headers.get('x-middleware-rewrite') ?? '').toContain(
      '/app-links/apple-app-site-association',
    );
    const assetLinks = await respond('https://contest.example/.well-known/assetlinks.json');
    expect(assetLinks.headers.get('x-middleware-rewrite') ?? '').toContain('/app-links/assetlinks');
  });
});
