import type { ConfigContext, ExpoConfig } from 'expo/config';

const BACKGROUND_COLOR = '#fbfaf7';
const DEVELOPMENT_WEB_ORIGIN = 'http://localhost:3200';
const HTTPS_ORIGIN = /^(https:\/\/[^\s/?#@]+)(?:[/?#]|$)/i;

/**
 * 번들에 박힐 웹 origin을 설정 단계(prebuild·번들링)에서 확인한다. 개발 빌드만 기본값 localhost와 http를 쓴다.
 * 운영 빌드에 localhost가 박히면 모든 사용자가 오프라인 화면을 보고, http는 ATS·평문 차단으로 열리지 않는다.
 */
function resolveWebOrigin(configured: string | undefined, isDevelopment: boolean) {
  const value = configured?.trim();
  if (isDevelopment) return value || DEVELOPMENT_WEB_ORIGIN;
  const origin = value?.match(HTTPS_ORIGIN)?.[1];
  if (!origin)
    throw new Error(
      '운영 빌드에는 EXPO_PUBLIC_WEB_ORIGIN에 https origin(예: https://contest.example)을 넣어야 합니다. 개발 빌드는 APP_VARIANT=development를 함께 줍니다.',
    );
  return origin.toLowerCase();
}

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  // 개발 빌드만 http://localhost 웹을 연다. 운영은 https 전제라 평문 통신·로컬 네트워크 예외를 두지 않는다.
  const isDevelopment = process.env.APP_VARIANT === 'development';
  const webOrigin = resolveWebOrigin(process.env.EXPO_PUBLIC_WEB_ORIGIN, isDevelopment);
  return {
    ...config,
    name: '별사대',
    icon: './assets/icon.png',
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
        ...(isDevelopment ? { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } } : {}),
      },
    },
    android: {
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#e85d4a' },
      package: 'dev.side.photocontest',
      // 자동 백업이 WebView 쿠키 DB(세션)까지 클라우드·다른 기기로 옮기지 않게 한다. 앱이 따로 보관할 데이터는 없다.
      allowBackup: false,
      // 뒤로 가기를 BackHandler로 받아 웹에 먼저 물어봐야 한다.
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      ['expo-build-properties', { android: isDevelopment ? { usesCleartextTraffic: true } : {} }],
      ['expo-splash-screen', { backgroundColor: BACKGROUND_COLOR }],
      // 조직·프로젝트·토큰은 넣지 않는다. 소스맵 업로드는 빌드 환경의 SENTRY_ORG·SENTRY_PROJECT·SENTRY_AUTH_TOKEN으로만 한다.
      '@sentry/react-native/expo',
    ],
    extra: { webOrigin },
  };
}
