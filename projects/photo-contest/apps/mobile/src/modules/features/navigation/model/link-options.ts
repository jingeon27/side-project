import { APP_SCHEME, WEB_ORIGIN } from '@/modules/shared/config/env';

import type { ILinkOptions } from '../lib/deep-link';

export const LINK_OPTIONS: ILinkOptions = { webOrigin: WEB_ORIGIN, appScheme: APP_SCHEME };

/** 웹 경로(`/groups/1`)를 WebView가 열 주소로 바꾼다. */
export function toWebUrl(path: string) {
  return `${WEB_ORIGIN}${path}`;
}
