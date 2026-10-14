import { resolve } from 'node:path';

import { PROJECT_ROOT } from './paths';

// 테스트가 실행 중에 NODE_ENV 같은 값을 바꾸므로 모든 값은 호출할 때마다 읽는다.

const DEFAULT_WEB_ORIGIN = 'http://localhost:3200';
const DEFAULT_STORAGE_DIR = '.data/photos';
const DEFAULT_APP_SCHEME = 'photocontest';
const DEFAULT_APP_VERSION = '1.0.0';
const APP_VERSION_PATTERN = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const APP_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/;
// 웹 scheme으로 설정하면 일회용 코드가 웹으로 새므로 허용하지 않는다.
const RESERVED_SCHEMES = new Set([
  'http',
  'https',
  'javascript',
  'data',
  'file',
  'about',
  'blob',
  'ftp',
  'ws',
  'wss',
]);

export type TStorageBackend = 'local' | 's3';
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

export function apiPort() {
  return Number(process.env.PORT ?? 4200);
}

export function apiHost() {
  return process.env.API_HOST ?? '127.0.0.1';
}

export function webOrigin() {
  return new URL(process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN).origin;
}

export function developmentLoginEnabled() {
  return process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_LOGIN === 'true';
}

/** 형식이 틀리거나 웹 scheme이면 기본값을 쓴다. */
export function mobileAppScheme() {
  const value = process.env.MOBILE_APP_SCHEME;
  if (!value || !APP_SCHEME_PATTERN.test(value) || RESERVED_SCHEMES.has(value)) return DEFAULT_APP_SCHEME;
  return value;
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

export function storageBackend(): TStorageBackend {
  return process.env.STORAGE_BACKEND === 's3' ? 's3' : 'local';
}

/** 상대 경로는 실행 위치와 상관없이 projects/photo-contest 기준으로 해석한다. */
export function storageDir() {
  return resolve(PROJECT_ROOT, optional('STORAGE_DIR') ?? DEFAULT_STORAGE_DIR);
}

export function s3Settings(): IS3Settings {
  const bucket = optional('S3_BUCKET');
  if (!bucket) throw new Error('S3_BUCKET is required for S3 storage.');
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

/** 운영에서 설정이 빠지면 조용히 기본값으로 뜨지 않고 시작을 멈춘다. */
export function assertProductionConfig() {
  if (!isProduction()) return;
  const storageReady =
    storageBackend() === 's3' ? Boolean(optional('S3_BUCKET')) : Boolean(optional('STORAGE_DIR'));
  if (!process.env.WEB_ORIGIN?.startsWith('https://') || !optional('DATABASE_URL') || !storageReady)
    throw new Error('Production requires HTTPS WEB_ORIGIN, DATABASE_URL and persistent STORAGE_DIR.');
}
