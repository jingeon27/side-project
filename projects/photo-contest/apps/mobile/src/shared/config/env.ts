import { originOf } from '@photo-contest/bridge';

// Android 에뮬레이터도 `adb reverse tcp:3200 tcp:3200`으로 같은 주소를 쓴다. 10.0.2.2로 열면 API의 Origin 검사가 POST를 막는다.
const DEVELOPMENT_WEB_ORIGIN = 'http://localhost:3200';

function readWebOrigin() {
  const configured = process.env.EXPO_PUBLIC_WEB_ORIGIN;
  if (!configured) return DEVELOPMENT_WEB_ORIGIN;
  const origin = originOf(configured.trim());
  // 잘못된 값으로 조용히 localhost를 열면 운영 빌드가 빈 화면이 되므로 시작할 때 바로 드러낸다.
  if (!origin)
    throw new Error('EXPO_PUBLIC_WEB_ORIGIN은 https://contest.example 같은 http(s) origin이어야 합니다.');
  return origin;
}

export const WEB_ORIGIN = readWebOrigin();
/** API의 MOBILE_APP_SCHEME 기본값과 같아야 소셜 로그인 콜백이 앱으로 돌아온다. */
export const APP_SCHEME = 'photocontest';
/** 세션 쿠키가 웹 origin에 붙으므로 앱도 웹 origin의 `/backend/*` 프록시만 쓴다. */
export const API_BASE = `${WEB_ORIGIN}/backend`;
/** 업데이트 화면의 스토어 링크. 플랫폼별 빌드에서 넣고, 없으면 Android만 패키지 이름으로 만든다. */
export const STORE_URL = process.env.EXPO_PUBLIC_STORE_URL ?? null;
