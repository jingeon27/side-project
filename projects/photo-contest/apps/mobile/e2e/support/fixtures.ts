import { test as base } from '@playwright/test';

import { installNativeHost } from './native-host';
import type { INativeHost } from './native-host';

interface INativeHostFixtures {
  /** 페이지를 앱 WebView처럼 만든 가짜 앱. page.goto 전에 설치된다. */
  nativeHost: INativeHost;
}

export const test = base.extend<INativeHostFixtures>({
  // 두 번째 인자 이름을 use로 두면 React의 use로 오해받아 react-hooks 규칙에 걸린다.
  nativeHost: async ({ page }, provide, testInfo) => {
    const host = await installNativeHost(page, {
      platform: testInfo.project.name.startsWith('ios') ? 'ios' : 'android',
    });
    await provide(host);
    host.dispose();
  },
});

export { expect } from '@playwright/test';
