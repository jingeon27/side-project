import { originOf } from '@photo-contest/bridge';

// Android 에뮬레이터도 `adb reverse tcp:3200 tcp:3200`으로 같은 주소를 쓴다. 10.0.2.2로 열면 API의 Origin 검사가 POST를 막는다.
const DEVELOPMENT_WEB_ORIGIN = 'http://localhost:3200';

/**
 * 앱이 열 웹 origin. 개발 번들만 기본값 localhost와 http를 쓴다. 운영 빌드는 app.config.ts가 설정 단계에서 먼저 막고,
 * 번들과 설정의 값이 어긋났을 때를 위해 시작할 때 한 번 더 막는다(조용히 localhost를 열면 빈 화면이 된다).
 */
export function resolveWebOrigin(configured: string | undefined, isDevelopment: boolean) {
  const value = configured?.trim();
  if (!value && isDevelopment) return DEVELOPMENT_WEB_ORIGIN;
  if (!value) throw new Error('운영 빌드에는 WEB_ORIGIN(https origin)이 필요합니다.');
  const origin = originOf(value);
  if (!origin) throw new Error('WEB_ORIGIN은 https://contest.example 같은 http(s) origin이어야 합니다.');
  if (!isDevelopment && !origin.startsWith('https://'))
    throw new Error('운영 빌드의 WEB_ORIGIN은 https여야 합니다.');
  return origin;
}
