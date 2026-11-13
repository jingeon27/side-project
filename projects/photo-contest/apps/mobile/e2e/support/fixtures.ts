import { test as base, expect } from '@playwright/test';

import { installNativeHost, type INativeHost } from './native-host';

interface INativeHostOptions {
  /** 켜면 가짜 앱이 푸시 등록·배지·설정 기능을 웹에 알린다. `test.use({ nativePush: true })`로 켠다. */
  nativePush: boolean;
}

interface INativeHostFixtures {
  /** 페이지를 앱 WebView처럼 만든 가짜 앱. page.goto 전에 설치된다. */
  nativeHost: INativeHost;
}

export const test = base.extend<INativeHostOptions & INativeHostFixtures>({
  nativePush: [false, { option: true }],
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
  nativeHost: async ({ page, nativePush }, provide, testInfo) => {
    const host = await installNativeHost(page, {
      platform: testInfo.project.name.startsWith('ios') ? 'ios' : 'android',
      push: nativePush,
    });
    await provide(host);
    host.dispose();
  },
});

export { expect };
