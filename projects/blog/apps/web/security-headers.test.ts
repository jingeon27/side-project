import { describe, expect, it } from 'vitest';

import nextConfig from './next.config';
import { headers } from './security-headers';

describe('security headers', () => {
  it('blocks framing and MIME sniffing and limits referrers on every route', async () => {
    const routes = await headers();
    expect(routes).toEqual([{ source: '/:path*', headers: expect.any(Array) }]);
    const values = Object.fromEntries(routes[0]!.headers.map(({ key, value }) => [key, value]));
    expect(values['X-Frame-Options']).toBe('DENY');
    expect(values['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(values['X-Content-Type-Options']).toBe('nosniff');
    expect(values['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('does not restrict scripts that are still inline without a nonce', async () => {
    const [route] = await headers();
    const csp = route!.headers.find(({ key }) => key === 'Content-Security-Policy')!.value;
    expect(csp).not.toMatch(/(?:default|script)-src/);
  });

  it('is wired into the Next.js config', async () => {
    expect(await nextConfig.headers?.()).toEqual(await headers());
  });
});
