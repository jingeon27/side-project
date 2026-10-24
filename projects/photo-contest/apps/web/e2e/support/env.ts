export const WEB_PORT = 3320;
export const API_PORT = 4320;
export const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
/** 운영 빌드 서버가 요구하는 앱 링크 값. 실제 앱과 연결되지 않는 테스트 값이다. */
export const E2E_APP_LINK_ENV = {
  MOBILE_APPLE_TEAM_ID: 'E2ETEAM000',
  MOBILE_IOS_BUNDLE_ID: 'test.e2e.photocontest',
  MOBILE_ANDROID_PACKAGE: 'test.e2e.photocontest',
  MOBILE_ANDROID_SHA256_FINGERPRINTS: Array.from({ length: 32 }, () => 'E2').join(':'),
} as const;
