import { connection } from 'next/server';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { appAuthCallback } from './app-auth-callback';

vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }));

afterEach(() => {
  vi.mocked(connection).mockClear();
});

describe('app login callback page', () => {
  it('shows only a continue-in-app notice without repeating the code', async () => {
    const response = await appAuthCallback();
    const html = await response.text();
    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(html).toContain('앱에서 로그인을 계속해 주세요');
    expect(html).not.toMatch(/code=|login_failed/);
  });

  it('forbids caching, referrers, indexing and every script except the hashed query cleanup', async () => {
    const response = await appAuthCallback();
    const html = await response.text();
    const policy = response.headers.get('content-security-policy') ?? '';
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(policy).toContain("default-src 'none'");
    expect(html.match(/<script>([^<]*)<\/script>/)?.[1]).toBe(
      "history.replaceState(null,'',location.pathname);",
    );
    expect(html).not.toMatch(/<script[^>]+src=|<link|<img|<iframe/);
    expect(policy.match(/script-src '([^']+)'/)?.[1]).toMatch(/^sha256-/);
  });
});
