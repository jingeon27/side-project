import { assertSharedInstanceConfig } from './shared-instance';

// 테스트가 실행 중에 NODE_ENV 같은 값을 바꾸므로 모든 값은 호출할 때마다 읽는다.

const DEFAULT_WEB_ORIGIN = 'http://localhost:3200';
const DEFAULT_APP_VERSION = '1.0.0';

/** 새 S3 객체에만 붙이며 DB에 전체 키를 저장해 기존 객체도 계속 읽는다. */
export function s3KeyPrefix() {
  const prefix = (process.env.S3_KEY_PREFIX ?? '').trim().replace(/\/$/, '');
  if (prefix.length > 128 || (prefix && !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(prefix)))
    throw new Error('S3_KEY_PREFIX must contain relative path segments.');
  return prefix ? `${prefix}/` : '';
}

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

export function databaseUrl() {
  const value = optional('DATABASE_URL');
  if (!value) throw new Error('DATABASE_URL is required.');
  return value;
}

export function apiPort() {
  const url = URL.parse(process.env.API_URL ?? 'http://127.0.0.1:4200');
  if (
    !url ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('API_URL must be an HTTP(S) origin.');
  return Number(url.port || (url.protocol === 'https:' ? 443 : 80));
}

export function apiHost() {
  return isProduction() ? '0.0.0.0' : '127.0.0.1';
}

export function trustedProxyHops() {
  return isProduction() ? 1 : 0;
}

export function webOrigin() {
  return new URL(process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN).origin;
}

export function appVersions(): IAppVersions {
  return { minimumVersion: DEFAULT_APP_VERSION, latestVersion: DEFAULT_APP_VERSION };
}

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

export function sentryDsn() {
  return optional('SENTRY_DSN');
}

export function sentryEnvironment() {
  return optional('NODE_ENV') ?? 'development';
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
export function assertProductionConfig(migration = false) {
  if (!isProduction()) return;
  assertSharedInstanceConfig(process.env, migration);
  if (!process.env.WEB_ORIGIN?.startsWith('https://') || !optional('DATABASE_URL') || !optional('S3_BUCKET'))
    throw new Error('Production requires HTTPS WEB_ORIGIN, DATABASE_URL and S3_BUCKET.');
  assertS3Settings();
}

/** 테스트는 실제 Expo 제공자를 호출하지 않는다. */
export function mobilePushSettings() {
  return {
    enabled: !isTest() && process.env.PUSH_NOTIFICATIONS_ENABLED === 'true',
    accessToken: optional('EXPO_ACCESS_TOKEN'),
  };
}
