export function parseWebOrigin(value: string | undefined, development: boolean) {
  const origin = value ?? (development ? 'http://localhost:3300' : '');
  if (!/^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(origin))
    throw new Error('EXPO_PUBLIC_WEB_ORIGIN must be a bare HTTP(S) origin.');
  if (!development && !origin.startsWith('https://'))
    throw new Error('Production mobile builds require an HTTPS web origin.');
  return origin;
}
