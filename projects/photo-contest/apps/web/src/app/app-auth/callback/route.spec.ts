import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { GET } from './route';

function inlineHashes(html: string, tag: 'script' | 'style') {
  return [...html.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map(
    ([, source]) =>
      `'sha256-${createHash('sha256')
        .update(source ?? '')
        .digest('base64')}'`,
  );
}

describe('앱 로그인 콜백 안내 페이지', () => {
  it('코드를 다시 보여 주지 않고 앱에서 계속하라는 안내만 줘야 한다', async () => {
    const response = GET();
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(html).toContain('앱에서 로그인을 계속해 주세요');
    expect(html).not.toMatch(/code=|\?code|login_failed/);
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
  });

  it('캐시·Referer·색인을 막고 외부 스크립트 없이 해시가 맞는 인라인만 허용해야 한다', async () => {
    const response = GET();
    const html = await response.text();
    const policy = response.headers.get('content-security-policy') ?? '';

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain(`script-src ${inlineHashes(html, 'script').join(' ')}`);
    expect(policy).toContain(`style-src ${inlineHashes(html, 'style').join(' ')}`);
    expect(html).not.toMatch(/<script[^>]+src=|<link|<img|<iframe/);
  });

  it('주소창의 일회용 코드를 기록에서 지우는 스크립트만 실행해야 한다', async () => {
    const html = await GET().text();
    expect(html.match(/<script>([^<]*)<\/script>/)?.[1]).toBe(
      "history.replaceState(null,'',location.pathname);",
    );
  });
});
