import type { ConfigContext, ExpoConfig } from 'expo/config';

const BACKGROUND_COLOR = '#fbfaf7';
// 개발 빌드만 http://localhost 웹을 연다. 운영은 https 전제라 평문 통신을 허용하지 않는다.
const IS_DEVELOPMENT = process.env.APP_VARIANT === 'development';

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  return {
    ...config,
    name: '웃긴순간',
    slug: 'photo-contest',
    version: '1.0.0',
    scheme: 'photocontest',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    backgroundColor: BACKGROUND_COLOR,
    ios: {
      bundleIdentifier: 'dev.side.photocontest',
      infoPlist: {
        NSCameraUsageDescription: '공모전에 제출할 사진을 찍기 위해 카메라를 사용합니다.',
        NSPhotoLibraryUsageDescription: '공모전에 제출할 사진을 고르기 위해 사진 보관함에 접근합니다.',
        NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      },
    },
    android: {
      package: 'dev.side.photocontest',
      // 뒤로 가기를 BackHandler로 받아 웹에 먼저 물어봐야 한다.
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      ['expo-build-properties', { android: IS_DEVELOPMENT ? { usesCleartextTraffic: true } : {} }],
      ['expo-splash-screen', { backgroundColor: BACKGROUND_COLOR }],
      // 조직·프로젝트·토큰은 넣지 않는다. 소스맵 업로드는 빌드 환경의 SENTRY_ORG·SENTRY_PROJECT·SENTRY_AUTH_TOKEN으로만 한다.
      '@sentry/react-native/expo',
    ],
    extra: {
      webOrigin: process.env.EXPO_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3200',
    },
  };
}
