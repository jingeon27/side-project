/** 운영 빌드(`next start`) 웹이 요구하는 앱 링크 값. 실제 앱과 연결되지 않는 테스트 값이다. */
export const E2E_APP_LINK_ENV = {
  MOBILE_APPLE_TEAM_ID: 'E2ETEAM000',
  MOBILE_IOS_BUNDLE_ID: 'test.e2e.gamefeedback',
  MOBILE_ANDROID_PACKAGE: 'test.e2e.gamefeedback',
  MOBILE_ANDROID_SHA256_FINGERPRINTS: Array.from({ length: 32 }, () => 'E2').join(':'),
} as const;
