import { afterEach, expect, it, vi } from 'vitest';

import { readRuntimeSecret } from '@/shared/config/runtime-secret.server';

import { forwardedClientHeaders, publicServerOptions } from './server';

vi.mock('@/shared/config/runtime-secret.server', () => ({ readRuntimeSecret: vi.fn() }));

vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// Next aborts a partially prefetched route when Date.now() runs during its runtime stage (PR #41 e2e failure).
it('signs with the current time without calling Date.now()', () => {
  vi.mocked(readRuntimeSecret).mockReturnValue('test-only-forwarded-client-secret-'.repeat(2));
  const dateNow = vi.spyOn(Date, 'now');
  const signed = forwardedClientHeaders('203.0.113.7');
  const shared = publicServerOptions().headers;
  expect(dateNow).not.toHaveBeenCalled();
  dateNow.mockRestore();
  const seconds = Date.now() / 1000;
  for (const headers of [signed, shared])
    expect(Math.abs(Number(headers['x-gf-client-timestamp']) - seconds)).toBeLessThanOrEqual(2);
});
