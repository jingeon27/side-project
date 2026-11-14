import Constants from 'expo-constants';

import { resolveWebOrigin } from './web-origin';

const config = Constants.expoConfig?.extra;
export const WEB_ORIGIN = resolveWebOrigin(
  typeof config?.webOrigin === 'string' ? config.webOrigin : undefined,
  __DEV__,
);
export const APP_SCHEME = 'photocontest';
export const API_BASE = `${WEB_ORIGIN}/backend`;
export const SENTRY_DSN =
  typeof config?.sentryDsn === 'string' && config.sentryDsn.trim() ? config.sentryDsn : null;
export const AMPLITUDE_API_KEY =
  typeof config?.amplitudeApiKey === 'string' && config.amplitudeApiKey.trim()
    ? config.amplitudeApiKey
    : null;
/** 스토어에 등록하기 전에는 없다. 형식은 스토어 주소를 만들 때 검사한다. */
export const IOS_APP_STORE_ID = typeof config?.iosAppStoreId === 'string' ? config.iosAppStoreId : null;
