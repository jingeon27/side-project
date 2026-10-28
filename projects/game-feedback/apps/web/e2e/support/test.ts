import { createHash } from 'node:crypto';

import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';
export type { APIRequestContext, Browser, BrowserContext, Locator, Page } from '@playwright/test';

export const test = base.extend({
  context: async ({ context, baseURL }, run, testInfo) => {
    if (!baseURL) throw new Error('브라우저 테스트의 baseURL이 필요합니다.');
    const origin = new URL(baseURL).origin;
    const digest = createHash('sha256').update(testInfo.testId).digest('hex');
    const address = `2001:db8:${Array.from({ length: 6 }, (_, index) =>
      digest.slice(index * 4, index * 4 + 4),
    ).join(':')}`;
    const detailPage = (url: URL) =>
      url.origin === origin && /^\/(?:ko|en|ja)\/(?:posts|users)\/[^/]+$/.test(url.pathname);
    // 방문자 예산을 테스트별로 분리한다. 외부 업로드에는 CORS 허용 밖의 헤더를 추가하지 않는다.
    await context.route(detailPage, async (route) =>
      route.continue({
        headers: { ...(await route.request().allHeaders()), 'X-Forwarded-For': address },
      }),
    );
    try {
      await run(context);
    } finally {
      await context.unroute(detailPage);
    }
  },
});
