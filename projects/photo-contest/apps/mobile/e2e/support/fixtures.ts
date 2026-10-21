import { test as base, expect } from '@playwright/test';

import { installNativeHost, type INativeHost } from './native-host';

interface INativeHostFixtures {
  /** 페이지를 앱 WebView처럼 만든 가짜 앱. page.goto 전에 설치된다. */
  nativeHost: INativeHost;
}

export const test = base.extend<INativeHostFixtures>({
  page: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() =>
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = 'nextjs-portal{display:none!important}';
        document.head.append(style);
      }),
    );
    await provide(page);
    expect(errors).toEqual([]);
  },
  // 두 번째 인자 이름을 use로 두면 React의 use로 오해받아 react-hooks 규칙에 걸린다.
  nativeHost: async ({ page }, provide, testInfo) => {
    const host = await installNativeHost(page, {
      platform: testInfo.project.name.startsWith('ios') ? 'ios' : 'android',
    });
    await provide(host);
    host.dispose();
  },
});

export { expect };
