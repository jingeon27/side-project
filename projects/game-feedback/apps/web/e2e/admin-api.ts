/** Administrator fixtures call the private API directly; the public web never proxies admin routes. */
export function adminApi(path: string) {
  const origin = new URL(process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3301');
  if (
    origin.protocol !== 'http:' ||
    origin.hostname !== '127.0.0.1' ||
    !['3301', '3302', '3353'].includes(origin.port) ||
    !path.startsWith('/api/admin/')
  )
    throw new Error('Admin fixtures require the isolated browser-test API.');
  origin.port = String(Number(origin.port) + 1000);
  return new URL(path, origin).toString();
}
