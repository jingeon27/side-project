import type { ConfigContext, ExpoConfig } from 'expo/config';

const BACKGROUND_COLOR = '#ffffff';
const DEVELOPMENT_WEB_ORIGIN = 'http://localhost:3200';
const HTTPS_ORIGIN = /^(https:\/\/[^\s/?#@]+)(?:[/?#]|$)/i;
/** 소셜 로그인 콜백 경로. src/shared/config/app-links.ts, 웹 안내 페이지·AASA, API MOBILE_AUTH_CALLBACK_URL과 같다. */
const AUTH_CALLBACK_PATH = '/app-auth/callback';
/** ASWebAuthenticationSession이 https 콜백(Universal Link)을 받는 최소 버전 */
const IOS_DEPLOYMENT_TARGET = '17.4';
/** 개발 빌드 식별자. 운영 식별자는 아직 정하지 않아 빌드 환경변수로만 받는다. */
const DEVELOPMENT_APP_ID = 'dev.side.photocontest';
/** 앱 링크는 기본 포트의 https host에만 둔다(AASA·assetlinks는 443에서만 확인된다). */
const LINK_ORIGIN = /^https:\/\/([a-z0-9.-]+)$/;
const APPLE_TEAM_ID = /^[A-Z0-9]{10}$/;
const IOS_BUNDLE_ID = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;

type TEnv = Record<string, string | undefined>;

export interface IBuildSettings {
  isDevelopment: boolean;
  webOrigin: string;
  /** 앱 링크를 둘 https host(기본 포트). 개발 빌드가 http 웹을 열면 없다. */
  linkHost: string | null;
  iosBundleId: string;
  androidPackage: string;
  appleTeamId: string | null;
}

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

/**
 * 빌드 설정을 읽는다. APP_VARIANT=development가 아닌 빌드는 모두 운영 빌드로 보고, 기본 포트의 https 웹 origin과
 * 앱 링크 값(Apple Team ID·iOS bundle id·Android package)이 하나라도 없으면 멈춘다. 빠진 채로 나가면 소셜 로그인이 앱으로 돌아오지 않는다.
 */
export function readBuildSettings(env: TEnv): IBuildSettings {
  const isDevelopment = env.APP_VARIANT === 'development';
  const value = (name: string) => env[name]?.trim() || null;
  const webOrigin = resolveWebOrigin(env.EXPO_PUBLIC_WEB_ORIGIN, isDevelopment);
  const linkHost = webOrigin.toLowerCase().match(HTTPS_ORIGIN)?.[1]?.match(LINK_ORIGIN)?.[1] ?? null;
  const iosBundleId = value('MOBILE_IOS_BUNDLE_ID') ?? (isDevelopment ? DEVELOPMENT_APP_ID : '');
  const androidPackage = value('MOBILE_ANDROID_PACKAGE') ?? (isDevelopment ? DEVELOPMENT_APP_ID : '');
  const appleTeamId = value('MOBILE_APPLE_TEAM_ID');
  const invalid = [
    isDevelopment || linkHost ? null : 'EXPO_PUBLIC_WEB_ORIGIN(포트 없는 https origin)',
    IOS_BUNDLE_ID.test(iosBundleId) ? null : 'MOBILE_IOS_BUNDLE_ID',
    ANDROID_PACKAGE.test(androidPackage) ? null : 'MOBILE_ANDROID_PACKAGE',
    (appleTeamId === null && isDevelopment) || APPLE_TEAM_ID.test(appleTeamId ?? '')
      ? null
      : 'MOBILE_APPLE_TEAM_ID',
  ].filter((name) => name !== null);
  if (invalid.length > 0)
    throw new Error(
      `${isDevelopment ? '개발' : '운영'} 빌드 설정이 없거나 형식이 틀렸습니다: ${invalid.join(', ')}. ` +
        '운영 빌드는 빌드 환경(EAS 환경변수 등)에 값을 넣고, 개발 빌드는 APP_VARIANT=development로 실행하세요.',
    );
  return { isDevelopment, webOrigin, linkHost, iosBundleId, androidPackage, appleTeamId };
}

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  // 개발 빌드만 http://localhost 웹을 연다. 운영은 https 전제라 평문 통신·로컬 네트워크 예외를 두지 않는다.
  const settings = readBuildSettings(process.env);
  const { isDevelopment, linkHost } = settings;
  // 개발 빌드는 Apple CDN 대신 웹 서버에서 AASA를 바로 받는다(기기의 개발자 설정 Associated Domains Development 필요).
  const domainMode = isDevelopment ? '?mode=developer' : '';
  return {
    ...config,
    name: '별사대',
    icon: './assets/icon.png',
    slug: 'photo-contest',
    version: '1.0.0',
    // 로그인 밖의 딥링크용. 소셜 로그인 코드는 아래 https 앱 링크로만 받는다.
    scheme: 'photocontest',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    backgroundColor: BACKGROUND_COLOR,
    ios: {
      bundleIdentifier: settings.iosBundleId,
      ...(settings.appleTeamId ? { appleTeamId: settings.appleTeamId } : {}),
      deploymentTarget: IOS_DEPLOYMENT_TARGET,
      // applinks: 세션 밖에서 열린 콜백을 앱으로, webcredentials: ASWebAuthenticationSession https 콜백의 도메인 연결
      ...(linkHost
        ? {
            associatedDomains: [
              `applinks:${linkHost}${domainMode}`,
              `webcredentials:${linkHost}${domainMode}`,
            ],
          }
        : {}),
      infoPlist: {
        NSCameraUsageDescription: '공모전에 제출할 사진을 찍기 위해 카메라를 사용합니다.',
        NSPhotoLibraryUsageDescription: '공모전에 제출할 사진을 고르기 위해 사진 보관함에 접근합니다.',
        ...(isDevelopment ? { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } } : {}),
      },
    },
    android: {
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#e85d4a' },
      package: settings.androidPackage,
      ...(process.env.MOBILE_GOOGLE_SERVICES_JSON
        ? { googleServicesFile: process.env.MOBILE_GOOGLE_SERVICES_JSON }
        : {}),
      // 자동 백업이 WebView 쿠키 DB(세션)까지 클라우드·다른 기기로 옮기지 않게 한다. 앱이 따로 보관할 데이터는 없다.
      allowBackup: false,
      // 뒤로 가기를 BackHandler로 받아 웹에 먼저 물어봐야 한다.
      predictiveBackGestureEnabled: false,
      // 웹 origin의 assetlinks.json으로 검증된 App Link만 콜백을 이 앱으로 연다(같은 스킴을 등록한 앱이 가로채지 못한다).
      ...(linkHost
        ? {
            intentFilters: [
              {
                action: 'VIEW',
                autoVerify: true,
                category: ['BROWSABLE', 'DEFAULT'],
                data: [{ scheme: 'https', host: linkHost, path: AUTH_CALLBACK_PATH }],
              },
            ],
          }
        : {}),
    },
    plugins: [
      ['expo-notifications', { defaultChannel: 'activity' }],
      ['expo-build-properties', { android: isDevelopment ? { usesCleartextTraffic: true } : {} }],
      ['expo-splash-screen', { backgroundColor: BACKGROUND_COLOR, dark: { backgroundColor: '#141312' } }],
      // 조직·프로젝트·토큰은 넣지 않는다. 소스맵 업로드는 빌드 환경의 SENTRY_ORG·SENTRY_PROJECT·SENTRY_AUTH_TOKEN으로만 한다.
      '@sentry/react-native/expo',
    ],
    extra: {
      ...config.extra,
      webOrigin: settings.webOrigin,
      ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
        ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } }
        : {}),
    },
  };
}
