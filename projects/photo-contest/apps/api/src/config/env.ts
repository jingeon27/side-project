import { assertSharedInstanceConfig } from './shared-instance';

// 테스트가 실행 중에 NODE_ENV 같은 값을 바꾸므로 모든 값은 호출할 때마다 읽는다.

const DEFAULT_WEB_ORIGIN = 'http://localhost:3200';
const DEFAULT_APP_VERSION = '1.0.0';
const APP_VERSION_PATTERN = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
/**
 * 앱 로그인 일회용 코드를 받는 웹 경로. 웹 안내 페이지, AASA·assetlinks, 앱의 associated domains·intent filter와 같은 값이다.
 * 검증된 App Link·Universal Link만 이 경로를 앱으로 넘기므로 같은 스킴을 등록한 다른 앱이 코드를 가로채지 못한다.
 */
export const MOBILE_AUTH_CALLBACK_PATH = '/app-auth/callback';

/** 새 S3 객체에만 붙이며 DB에 전체 키를 저장해 기존 객체도 계속 읽는다. */
export function s3KeyPrefix() {
  const prefix = (process.env.S3_KEY_PREFIX ?? '').trim().replace(/\/$/, '');
  if (prefix.length > 128 || (prefix && !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(prefix)))
    throw new Error('S3_KEY_PREFIX must contain relative path segments.');
  return prefix ? `${prefix}/` : '';
}
export type TOAuthProviderName = 'google' | 'kakao';

export interface IAppVersions {
  minimumVersion: string;
  latestVersion: string;
}

export interface IS3Settings {
  bucket: string;
  region: string;
  endpoint: string | undefined;
  forcePathStyle: boolean;
}

export interface IOAuthCredentials {
  clientId: string | undefined;
  clientSecret: string | undefined;
}

function optional(name: string) {
  const value = process.env[name];
  return value ? value : undefined;
}

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

export function isTest() {
  return process.env.NODE_ENV === 'test';
}

export function testingApiEnabled() {
  return isTest() && process.env.ENABLE_TEST_API === 'true';
}

/** 테스트 fixture를 만드는 엔드포인트가 개발·운영 서버에 열리는 설정은 시작부터 거절한다. */
export function assertTestingConfig() {
  if (process.env.ENABLE_TEST_API === 'true' && !isTest())
    throw new Error('ENABLE_TEST_API requires NODE_ENV=test.');
}

export function databaseUrl() {
  const value = optional('DATABASE_URL');
  if (!value) throw new Error('DATABASE_URL is required.');
  return value;
}

export function apiPort() {
  return Number(process.env.PORT ?? 4200);
}

export function apiHost() {
  return process.env.API_HOST ?? '127.0.0.1';
}

export function trustedProxyHops() {
  const value = process.env.TRUST_PROXY_HOPS ?? '0';
  if (value === '0') return 0;
  if (value === '1') return 1;
  throw new Error('TRUST_PROXY_HOPS must be 0 or 1.');
}

export function webOrigin() {
  return new URL(process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN).origin;
}

export function developmentLoginEnabled() {
  return process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_LOGIN === 'true';
}

/** WEB_ORIGIN의 앱 로그인 콜백 경로와 정확히 같은 URL만 받는다(쿼리·해시·계정 정보 없음). */
function configuredMobileAuthCallbackUrl() {
  const value = optional('MOBILE_AUTH_CALLBACK_URL');
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const exact =
      url.origin === webOrigin() &&
      url.pathname === MOBILE_AUTH_CALLBACK_PATH &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password;
    return exact ? `${url.origin}${url.pathname}` : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 앱 로그인 코드를 보낼 콜백 URL. 커스텀 스킴으로는 보내지 않는다.
 * 개발·테스트는 설정이 없거나 틀리면 WEB_ORIGIN의 같은 경로를 쓰고, 운영은 assertProductionConfig가 시작 전에 막는다.
 */
export function mobileAuthCallbackUrl() {
  return configuredMobileAuthCallbackUrl() ?? `${webOrigin()}${MOBILE_AUTH_CALLBACK_PATH}`;
}

function appVersion(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && APP_VERSION_PATTERN.test(trimmed) ? trimmed : undefined;
}

function compareAppVersions(left: string, right: string) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 형식이 틀린 값은 기본값으로 대체하고, 최신 버전이 최소 버전보다 낮으면 최소 버전을 쓴다. */
export function appVersions(): IAppVersions {
  const minimumVersion = appVersion(process.env.MOBILE_MINIMUM_VERSION) ?? DEFAULT_APP_VERSION;
  const latest = appVersion(process.env.MOBILE_LATEST_VERSION);
  const latestVersion = latest && compareAppVersions(latest, minimumVersion) >= 0 ? latest : minimumVersion;
  return { minimumVersion, latestVersion };
}

/** 미디어는 항상 비공개 S3 호환 버킷에 둔다. 로컬 개발·테스트는 test-kit의 S3 대역을 가리킨다. */
export function s3Settings(): IS3Settings {
  const bucket = optional('S3_BUCKET');
  if (!bucket) throw new Error('S3_BUCKET is required for media storage.');
  return {
    bucket,
    region: optional('S3_REGION') ?? 'auto',
    endpoint: optional('S3_ENDPOINT'),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  };
}

export function oauthCredentials(provider: TOAuthProviderName): IOAuthCredentials {
  const prefix = provider.toUpperCase();
  return { clientId: optional(`${prefix}_CLIENT_ID`), clientSecret: optional(`${prefix}_CLIENT_SECRET`) };
}

export function sentryDsn() {
  return optional('SENTRY_DSN');
}

export function sentryEnvironment() {
  return optional('NODE_ENV') ?? 'development';
}

export function sentryRelease() {
  return optional('SENTRY_RELEASE');
}

/** 0~1 사이 숫자가 아니면 0(추적하지 않음) */
export function sentryTracesSampleRate() {
  const rate = Number(optional('SENTRY_TRACES_SAMPLE_RATE'));
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0;
}

// Google 웹 클라이언트는 토큰 교환에 secret이 필요하다. 카카오는 콘솔에서 client secret을 켤 때만 쓴다.
const OAUTH_SECRET_REQUIRED: Record<TOAuthProviderName, boolean> = { google: true, kakao: false };

/** 짝이 맞지 않는 OAuth 키는 첫 로그인의 provider 오류가 아니라 시작할 때 드러낸다. */
function assertOAuthCredentials() {
  for (const provider of Object.keys(OAUTH_SECRET_REQUIRED) as TOAuthProviderName[]) {
    const prefix = provider.toUpperCase();
    const { clientId, clientSecret } = oauthCredentials(provider);
    if (clientSecret && !clientId)
      throw new Error(`${prefix}_CLIENT_SECRET is set without ${prefix}_CLIENT_ID.`);
    if (clientId && !clientSecret && OAUTH_SECRET_REQUIRED[provider])
      throw new Error(`${prefix}_CLIENT_ID requires ${prefix}_CLIENT_SECRET.`);
  }
}

function assertS3Settings() {
  const { endpoint } = s3Settings();
  s3KeyPrefix();
  if (!endpoint) return;
  const url = URL.parse(endpoint);
  if (!url || !['http:', 'https:'].includes(url.protocol))
    throw new Error('S3_ENDPOINT must be an http(s) URL.');
}

/** 운영에서 설정이 빠지거나 틀리면 조용히 기본값으로 뜨거나 첫 요청에서 실패하지 않고 시작을 멈춘다. */
export function assertProductionConfig() {
  if (!isProduction()) return;
  assertSharedInstanceConfig(process.env);
  if (!process.env.WEB_ORIGIN?.startsWith('https://') || !optional('DATABASE_URL') || !optional('S3_BUCKET'))
    throw new Error('Production requires HTTPS WEB_ORIGIN, DATABASE_URL and S3_BUCKET.');
  assertS3Settings();
  assertOAuthCredentials();
  // 앱 로그인 코드는 검증된 https 콜백으로만 보낸다. 다른 origin·경로로 잘못 설정하면 코드가 앱 링크 밖으로 샌다.
  if (!configuredMobileAuthCallbackUrl())
    throw new Error(
      `Production requires MOBILE_AUTH_CALLBACK_URL=${webOrigin()}${MOBILE_AUTH_CALLBACK_PATH} (same origin as WEB_ORIGIN).`,
    );
}
