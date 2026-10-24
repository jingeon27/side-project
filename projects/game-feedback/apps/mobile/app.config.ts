import type { ConfigContext, ExpoConfig } from 'expo/config';

/** 소셜 로그인 콜백 경로. bridge `APP_AUTH_CALLBACK_PATH`, 웹 안내 페이지·AASA, API `APP_AUTH_CALLBACK_PATH`와 같다. */
const AUTH_CALLBACK_PATH = '/app-auth/callback';
/** ASWebAuthenticationSession이 https 콜백(Universal Link)을 받는 최소 버전 */
const IOS_DEPLOYMENT_TARGET = '17.4';
const DEVELOPMENT_WEB_ORIGIN = 'http://localhost:3300';
/** 개발 빌드 식별자. 운영 식별자는 아직 정하지 않아 빌드 환경변수로만 받는다. */
const DEVELOPMENT_APP_ID = 'dev.side.gamefeedback';

const WEB_ORIGIN = /^(https?):\/\/([a-z0-9.-]+)(:\d{1,5})?$/i;
const APPLE_TEAM_ID = /^[A-Z0-9]{10}$/;
const IOS_BUNDLE_ID = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;

type TEnv = Record<string, string | undefined>;

export interface IBuildSettings {
  isDevelopment: boolean;
  /** 앱 링크를 둘 https host(기본 포트). 개발 빌드가 http 웹을 열면 없다. */
  linkHost: string | null;
  iosBundleId: string;
  androidPackage: string;
  appleTeamId: string | null;
}

/**
 * 빌드 설정을 읽는다. APP_VARIANT=development가 아닌 빌드는 모두 운영 빌드로 보고, https 웹 origin과
 * 앱 링크 값(Apple Team ID·iOS bundle id·Android package)이 하나라도 없으면 멈춘다. 빠진 채로 나가면 소셜 로그인이 앱으로 돌아오지 않는다.
 */
export function readBuildSettings(env: TEnv): IBuildSettings {
  const isDevelopment = env.APP_VARIANT === 'development';
  const value = (name: string) => env[name]?.trim() || null;
  const webOrigin = value('EXPO_PUBLIC_WEB_ORIGIN') ?? (isDevelopment ? DEVELOPMENT_WEB_ORIGIN : '');
  const [, scheme, host, port] = WEB_ORIGIN.exec(webOrigin) ?? [];
  const linkHost = scheme?.toLowerCase() === 'https' && host && !port ? host.toLowerCase() : null;
  const iosBundleId = value('MOBILE_IOS_BUNDLE_ID') ?? (isDevelopment ? DEVELOPMENT_APP_ID : '');
  const androidPackage = value('MOBILE_ANDROID_PACKAGE') ?? (isDevelopment ? DEVELOPMENT_APP_ID : '');
  const appleTeamId = value('MOBILE_APPLE_TEAM_ID');
  const checks: [string, boolean][] = [
    ['EXPO_PUBLIC_WEB_ORIGIN(https, 포트 없음)', Boolean(isDevelopment ? scheme : linkHost)],
    ['MOBILE_IOS_BUNDLE_ID', IOS_BUNDLE_ID.test(iosBundleId)],
    ['MOBILE_ANDROID_PACKAGE', ANDROID_PACKAGE.test(androidPackage)],
    [
      'MOBILE_APPLE_TEAM_ID',
      (appleTeamId === null && isDevelopment) || APPLE_TEAM_ID.test(appleTeamId ?? ''),
    ],
  ];
  const invalid = checks.filter(([, valid]) => !valid).map(([name]) => name);
  if (invalid.length > 0)
    throw new Error(
      `${isDevelopment ? '개발' : '운영'} 빌드 설정이 없거나 형식이 틀렸습니다: ${invalid.join(', ')}. ` +
        '운영 빌드는 빌드 환경(EAS 환경변수 등)에 값을 넣고, 개발 빌드는 APP_VARIANT=development로 실행하세요.',
    );
  return { isDevelopment, linkHost, iosBundleId, androidPackage, appleTeamId };
}

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const settings = readBuildSettings(process.env);
  const { isDevelopment, linkHost } = settings;
  // 개발 빌드는 Apple CDN 대신 웹 서버에서 AASA를 바로 받는다(기기의 개발자 설정 Associated Domains Development 필요).
  const domainMode = isDevelopment ? '?mode=developer' : '';
  return {
    ...config,
    extra: {
      ...config.extra,
      ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
        ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } }
        : {}),
    },
    name: 'Game Mate',
    icon: './assets/icon.png',
    slug: 'game-feedback',
    version: '1.0.0',
    // 로그인 밖의 딥링크용. 소셜 로그인 코드는 아래 https 앱 링크로만 받는다.
    scheme: 'gamefeedback',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    backgroundColor: '#ffffff',
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
        NSPhotoLibraryUsageDescription: '채팅에서 사진과 동영상을 선택해 전송할 때 사진 보관함을 사용합니다.',
        NSCameraUsageDescription: '채팅에 전송할 사진이나 동영상을 촬영할 때 카메라를 사용합니다.',
        NSMicrophoneUsageDescription: '채팅에 전송할 동영상을 촬영할 때 소리를 녹음합니다.',
        NSAppTransportSecurity: isDevelopment ? { NSAllowsLocalNetworking: true } : {},
      },
    },
    android: {
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#147d64' },
      package: settings.androidPackage,
      ...(process.env.MOBILE_GOOGLE_SERVICES_JSON
        ? { googleServicesFile: process.env.MOBILE_GOOGLE_SERVICES_JSON }
        : {}),
      allowBackup: false,
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
    ],
  };
}
