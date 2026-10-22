import { APP_AUTH_CALLBACK_PATH } from '@game-feedback/bridge';

/** `/.well-known/*` 파일은 Apple CDN·Google 검증기가 주기적으로 다시 받는다. */
const APP_LINKS_CACHE_CONTROL = 'public, max-age=3600';

const APPLE_TEAM_ID = /^[A-Z0-9]{10}$/;
const IOS_BUNDLE_ID = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const SHA256_FINGERPRINT = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/;

/** 개발·테스트에서 값이 없을 때 쓰는 자리표시자. 실제 앱과 연결되지 않는다. */
const PLACEHOLDER_ENV = {
  MOBILE_APPLE_TEAM_ID: 'TEAMID0000',
  MOBILE_IOS_BUNDLE_ID: 'dev.side.gamefeedback',
  MOBILE_ANDROID_PACKAGE: 'dev.side.gamefeedback',
  MOBILE_ANDROID_SHA256_FINGERPRINTS: Array.from({ length: 32 }, () => '00').join(':'),
} as const;

type TEnv = Record<string, string | undefined>;
type TAppLinkEnvName = keyof typeof PLACEHOLDER_ENV;

export interface IAppLinksConfig {
  /** `<Apple Team ID>.<iOS bundle id>` */
  iosAppId: string;
  androidPackage: string;
  /** 앱 서명 인증서 SHA-256(Play App Signing 키와 업로드 키 등). 대문자·콜론 구분 */
  androidFingerprints: string[];
}

export type TAppLinksConfigResult =
  { ok: true; config: IAppLinksConfig } | { ok: false; invalid: TAppLinkEnvName[] };

/**
 * 앱 링크 검증 파일 설정을 읽는다. 운영은 배포 환경변수만 쓰고, 개발·테스트는 빈 값을 자리표시자로 채운다.
 * 형식이 틀린 값은 어느 환경이든 틀린 이름 목록으로 돌려준다.
 */
export function readAppLinksConfig(env: TEnv): TAppLinksConfigResult {
  const isProduction = env.NODE_ENV === 'production';
  const value = (name: TAppLinkEnvName) => env[name]?.trim() || (isProduction ? '' : PLACEHOLDER_ENV[name]);
  const teamId = value('MOBILE_APPLE_TEAM_ID');
  const bundleId = value('MOBILE_IOS_BUNDLE_ID');
  const androidPackage = value('MOBILE_ANDROID_PACKAGE');
  const fingerprints = [
    ...new Set(
      value('MOBILE_ANDROID_SHA256_FINGERPRINTS')
        .split(',')
        .map((fingerprint) => fingerprint.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  const checks: [TAppLinkEnvName, boolean][] = [
    ['MOBILE_APPLE_TEAM_ID', APPLE_TEAM_ID.test(teamId)],
    ['MOBILE_IOS_BUNDLE_ID', IOS_BUNDLE_ID.test(bundleId)],
    ['MOBILE_ANDROID_PACKAGE', ANDROID_PACKAGE.test(androidPackage)],
    [
      'MOBILE_ANDROID_SHA256_FINGERPRINTS',
      fingerprints.length > 0 && fingerprints.every((fingerprint) => SHA256_FINGERPRINT.test(fingerprint)),
    ],
  ];
  const invalid = checks.filter(([, valid]) => !valid).map(([name]) => name);
  if (invalid.length > 0) return { ok: false, invalid };
  return {
    ok: true,
    config: { iosAppId: `${teamId}.${bundleId}`, androidPackage, androidFingerprints: fingerprints },
  };
}

/** 서버가 뜰 때 부른다. 운영에서 값이 빠지거나 틀리면 앱 로그인 콜백을 검증할 수 없으므로 시작을 멈춘다. */
export function assertAppLinksConfig(env: TEnv) {
  const result = readAppLinksConfig(env);
  if (!result.ok)
    throw new Error(
      `App Links·Universal Links settings are missing or invalid: ${result.invalid.join(', ')}. ` +
        'Set the Apple Team ID (10 characters), iOS bundle id, Android package and signing certificate SHA-256 (AA:BB:…, comma-separated).',
    );
}

/** `/.well-known/apple-app-site-association`. Universal Link는 앱 로그인 콜백 경로만 앱으로 연다. */
export function buildAppleAppSiteAssociation({ iosAppId }: IAppLinksConfig) {
  return {
    applinks: { details: [{ appIDs: [iosAppId], components: [{ '/': APP_AUTH_CALLBACK_PATH }] }] },
    // ASWebAuthenticationSession의 https 콜백은 콜백 host가 앱과 연결된 도메인이어야 한다.
    webcredentials: { apps: [iosAppId] },
  };
}

/** `/.well-known/assetlinks.json`. Android App Link 검증(autoVerify)에 쓰인다. */
export function buildAssetLinks({ androidPackage, androidFingerprints }: IAppLinksConfig) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: androidPackage,
        sha256_cert_fingerprints: androidFingerprints,
      },
    },
  ];
}

/** 검증 파일 응답. 설정이 틀리면 엉뚱한 앱을 연결하지 않도록 내용을 주지 않는다. */
export function appLinksResponse(env: TEnv, build: (config: IAppLinksConfig) => unknown) {
  const result = readAppLinksConfig(env);
  if (!result.ok) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return Response.json(build(result.config), { headers: { 'Cache-Control': APP_LINKS_CACHE_CONTROL } });
}
