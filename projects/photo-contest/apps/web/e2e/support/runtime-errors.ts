import type { Page } from '@playwright/test';

export async function observeRuntimeErrors(page: Page) {
  const errors: string[] = [];
  await page.exposeFunction('__reportRuntimeError', (message: string) => errors.push(message));
  await page.addInitScript(() => {
    const report = Reflect.get(window, '__reportRuntimeError') as (message: string) => Promise<void>;
    // WebKit의 pageerror에는 처리된 fetch의 콘솔 오류도 섞이므로 실제 브라우저 오류 이벤트를 관찰한다.
    window.addEventListener(
      'error',
      (event) => void report(event.error instanceof Error ? event.error.message : event.message),
    );
    window.addEventListener(
      'unhandledrejection',
      (event) => void report(event.reason instanceof Error ? event.reason.message : String(event.reason)),
    );
  });
  return errors;
}
