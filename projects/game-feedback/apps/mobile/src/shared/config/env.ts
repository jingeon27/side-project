import { parseWebOrigin } from './web-origin';

export const WEB_ORIGIN = parseWebOrigin(process.env.EXPO_PUBLIC_WEB_ORIGIN, __DEV__);
export const APP_VERSION = '1.0.0';
