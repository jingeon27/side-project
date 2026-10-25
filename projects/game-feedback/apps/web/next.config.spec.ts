import { unstable_getResponseFromNextConfig } from 'next/experimental/testing/server';

import { describe, expect, it } from 'vitest';

import nextConfig from './next.config';

const respond = (url: string) => unstable_getResponseFromNextConfig({ url, nextConfig });

describe('next.config app links', () => {
  it('keeps the shared security headers on documents and App Link files', async () => {
    for (const url of [
      'https://game.example/ko',
      'https://game.example/app-auth/callbackx',
      'https://game.example/app-auth/callback/extra',
      'https://game.example/.well-known/assetlinks.json',
    ]) {
      const { headers } = await respond(url);
      expect(headers.get('x-frame-options'), url).toBe('DENY');
      expect(headers.get('content-security-policy'), url).toContain("frame-ancestors 'none'");
    }
  });

  it('leaves the app login callback headers to its route so the strict CSP and no-referrer are kept', async () => {
    for (const url of [
      'https://game.example/app-auth/callback',
      'https://game.example/app-auth/callback?code=x',
    ]) {
      const { headers } = await respond(url);
      expect(headers.get('content-security-policy'), url).toBeNull();
      expect(headers.get('referrer-policy'), url).toBeNull();
    }
  });
});
