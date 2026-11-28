import { describe, expect, it } from 'vitest';

import { localLoginEnabled } from './local-login';

describe('local test accounts', () => {
  const direct = () => new Headers({ host: '127.0.0.1:3460' });
  it('requires an opted-in development server on a supported loopback address', () => {
    expect(localLoginEnabled(direct(), 'development', '1')).toBe(true);
    expect(localLoginEnabled(new Headers({ host: 'localhost:3461' }), 'development', '1')).toBe(true);
    expect(localLoginEnabled(direct(), 'production', '1')).toBe(false);
    expect(localLoginEnabled(direct(), 'test', '1')).toBe(false);
    expect(localLoginEnabled(direct(), 'development', '0')).toBe(false);
  });
  it.each([
    { host: 'deokdam.bambyul.com' },
    { host: '127.0.0.1.remote.test:3460' },
    { host: '192.168.10.25:3460' },
    { 'x-forwarded-host': 'deokdam.bambyul.com' },
    { 'x-forwarded-proto': 'https' },
    { 'x-forwarded-for': '192.0.2.42, 127.0.0.1' },
    { forwarded: 'for=192.0.2.42' },
  ])('does not enable fixture access through a remote host or proxy %o', (input) => {
    const headers = direct();
    for (const [key, value] of Object.entries(input)) headers.set(key, value);
    expect(localLoginEnabled(headers, 'development', '1')).toBe(false);
  });
});
