import type { Page, Response } from '@playwright/test';

/**
 * 문서를 새로 받은 뒤에는 앱의 `<html data-hydrated>`까지 기다린다. hydration과 겹친 클릭·키 입력은
 * 느린 WebKit에서 라우터 초기화와 함께 사라져, 화면이 보이는 것만으로는 조작할 수 있다고 볼 수 없다.
 */
export function waitForHydrationOnLoad(page: Page) {
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  const ready = async (response: Response | null) => {
    // 콜백 안내 문서는 쿠키·분석·앱 런타임을 싣지 않는 독립 HTML이다.
    if (response && new URL(response.url()).pathname === '/app-auth/callback') return response;
    if (response?.headers()['content-type']?.includes('text/html'))
      await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
    return response;
  };
  page.goto = async (...args) => ready(await goto(...args));
  page.reload = async (...args) => ready(await reload(...args));
  return page;
}
