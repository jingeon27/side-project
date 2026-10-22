import { describe, expect, it } from 'vitest';

import {
  FORWARDED_CLIENT_HEADERS,
  forwardedClientKey,
  signForwardedClient,
  verifiedForwardedClient,
} from './forwarded-client';

const secret = 'test-only-forwarded-client-secret-'.repeat(2);
const key = forwardedClientKey(secret);
const timestamp = 1_790_000_000;
const now = timestamp * 1000;
function headers(client: string, at = timestamp, signingKey = key) {
  return {
    [FORWARDED_CLIENT_HEADERS.client]: client,
    [FORWARDED_CLIENT_HEADERS.timestamp]: String(at),
    [FORWARDED_CLIENT_HEADERS.signature]: signForwardedClient(signingKey, client, at),
  };
}

describe('client addresses forwarded by the web server', () => {
  it('matches the web signer for the same secret, time and client', () => {
    // apps/web/src/shared/api/server.spec.ts pins the same values.
    expect(signForwardedClient(key, '203.0.113.7', timestamp)).toBe(
      'n9UQhANQ7tvKVif30IeU53YT5kjP3-iFSdYTrWWBkkQ',
    );
    expect(signForwardedClient(key, 'internal', timestamp)).toBe(
      '3TpEMy8avP8vg8wlqDs9tnRyaZdM0b8tEseX0Jkdf74',
    );
  });
  it('accepts a signed visitor address or internal call inside the replay window', () => {
    expect(verifiedForwardedClient(headers('203.0.113.7'), key, now)).toBe('203.0.113.7');
    expect(verifiedForwardedClient(headers('2001:db8::1'), key, now + 59_000)).toBe('2001:db8::1');
    expect(verifiedForwardedClient(headers('internal'), key, now - 59_000)).toBe('internal');
  });
  it('ignores headers when no key is configured or the signature is for another value or key', () => {
    expect(verifiedForwardedClient(headers('203.0.113.7'), undefined, now)).toBeNull();
    expect(
      verifiedForwardedClient(
        { ...headers('203.0.113.7'), [FORWARDED_CLIENT_HEADERS.client]: '198.51.100.9' },
        key,
        now,
      ),
    ).toBeNull();
    expect(
      verifiedForwardedClient(
        { ...headers('203.0.113.7'), [FORWARDED_CLIENT_HEADERS.client]: 'internal' },
        key,
        now,
      ),
    ).toBeNull();
    expect(
      verifiedForwardedClient(headers('203.0.113.7', timestamp, forwardedClientKey(`${secret}x`)), key, now),
    ).toBeNull();
    expect(
      verifiedForwardedClient(
        { ...headers('203.0.113.7'), [FORWARDED_CLIENT_HEADERS.signature]: 'short' },
        key,
        now,
      ),
    ).toBeNull();
  });
  it('rejects stale, future, malformed and repeated values', () => {
    expect(verifiedForwardedClient(headers('203.0.113.7'), key, now + 61_000)).toBeNull();
    expect(verifiedForwardedClient(headers('203.0.113.7'), key, now - 61_000)).toBeNull();
    expect(verifiedForwardedClient(headers('not-an-ip'), key, now)).toBeNull();
    expect(verifiedForwardedClient(headers('203.0.113.7, 198.51.100.9'), key, now)).toBeNull();
    expect(
      verifiedForwardedClient(
        { ...headers('203.0.113.7'), [FORWARDED_CLIENT_HEADERS.timestamp]: '1790000000.5' },
        key,
        now,
      ),
    ).toBeNull();
    expect(
      verifiedForwardedClient(
        { ...headers('203.0.113.7'), [FORWARDED_CLIENT_HEADERS.client]: ['203.0.113.7', '203.0.113.7'] },
        key,
        now,
      ),
    ).toBeNull();
    expect(verifiedForwardedClient({}, key, now)).toBeNull();
  });
});
