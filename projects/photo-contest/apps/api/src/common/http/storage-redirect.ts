import type { Response } from 'express';

import { NO_STORE } from './no-store.middleware';

/** 고정 경로는 권한만 확인하고 짧은 서명 GET으로 보낸다. 만료되는 주소가 어떤 캐시에도 남지 않게 한다. */
export function redirectToStorage(res: Response, url: string) {
  res.status(307).set({ Location: url, 'Cache-Control': NO_STORE }).end();
}
