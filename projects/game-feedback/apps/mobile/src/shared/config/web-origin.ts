export function parseWebOrigin(value: string | undefined, development: boolean) {
  const origin = value ?? (development ? 'http://localhost:3300' : '');
  if (!/^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(origin))
    throw new Error('EXPO_PUBLIC_WEB_ORIGIN must be a bare HTTP(S) origin.');
  if (!development && !origin.startsWith('https://'))
    throw new Error('Production mobile builds require an HTTPS web origin.');
  // WebView가 보고하는 URL은 호스트를 소문자로, 기본 포트(:443·:80)를 생략한 형태다.
  // 출처 비교가 문자열 접두라 설정값도 같은 형태로 맞춘다. Expo 런타임의 URL은 WHATWG 규칙을 따른다.
  try {
    return new URL(origin).origin;
  } catch {
    throw new Error('EXPO_PUBLIC_WEB_ORIGIN must be a bare HTTP(S) origin.');
  }
}
