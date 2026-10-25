import Constants from 'expo-constants';

import { parseWebOrigin } from './web-origin';

const config = Constants.expoConfig?.extra;
export const WEB_ORIGIN = parseWebOrigin(
  typeof config?.webOrigin === 'string' ? config.webOrigin : undefined,
  __DEV__,
);
export const APP_VERSION = '1.0.0';
