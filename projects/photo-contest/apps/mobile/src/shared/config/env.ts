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
