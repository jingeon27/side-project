import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';

/**
 * The Next.js server calls the API over the private network, so the socket address is always the web
 * container. It forwards the visitor address (or `internal` for cookie-free cached reads) with an HMAC
 * keyed from the cache revalidation secret both servers already share. `apps/web/src/shared/api/server.ts`
 * signs with the same derivation; keep the two in sync. Node lowercases incoming header names, so the
 * lookup keys must be lowercase too.
 */
export const FORWARDED_CLIENT_HEADERS = {
  client: 'x-gf-client-ip',
  timestamp: 'x-gf-client-timestamp',
  signature: 'x-gf-client-signature',
} as const satisfies Record<string, Lowercase<string>>;
export const INTERNAL_CLIENT = 'internal';
// A captured header set can only be replayed inside this window.
const MAX_CLOCK_SKEW_SECONDS = 60;

export function forwardedClientKey(secret: string) {
  return createHmac('sha256', secret).update('game-feedback:forwarded-client:v1').digest();
}

export function signForwardedClient(key: Buffer, client: string, timestamp: number) {
  return createHmac('sha256', key).update(`${timestamp}\n${client}`).digest('base64url');
}

/** Returns the signed client (an IP address or `internal`), or null when the caller must be keyed by its socket. */
export function verifiedForwardedClient(
  headers: IncomingHttpHeaders,
  key: Buffer | undefined,
  now = Date.now(),
): string | null {
  if (!key) return null;
  const client = headers[FORWARDED_CLIENT_HEADERS.client];
  const timestamp = headers[FORWARDED_CLIENT_HEADERS.timestamp];
  const signature = headers[FORWARDED_CLIENT_HEADERS.signature];
  if (typeof client !== 'string' || typeof timestamp !== 'string' || typeof signature !== 'string')
    return null;
  if (client !== INTERNAL_CLIENT && isIP(client) === 0) return null;
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS)
    return null;
  const expected = Buffer.from(signForwardedClient(key, client, Number(timestamp)));
  const received = Buffer.from(signature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  return client;
}
