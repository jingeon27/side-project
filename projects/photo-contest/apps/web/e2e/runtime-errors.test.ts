import { expect, test } from '@playwright/test';
import { observeRuntimeErrors } from './support/runtime-errors';

test(
  '실제 예외와 처리하지 않은 Promise 실패를 모두 기록한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page }) => {
    const errors = await observeRuntimeErrors(page);
    await page.goto('/');
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('runtime exception');
      }, 0);
      void Promise.reject(new Error('unhandled rejection'));
    });
    await expect.poll(() => errors.toSorted()).toEqual(['runtime exception', 'unhandled rejection']);
  },
);

test(
  '처리한 네트워크 취소를 실제 JavaScript 예외로 판정하지 않는다',
  { tag: ['@ios', '@desktop'] },
  async ({ page }) => {
    const errors = await observeRuntimeErrors(page);
    await page.route('**/__e2e-cancelled-fetch', (route) => route.abort('aborted'));
    await page.goto('/');
    const rejected = await page.evaluate(() =>
      fetch('/__e2e-cancelled-fetch').then(
        () => false,
        () => true,
      ),
    );
    expect(rejected).toBe(true);
    expect(errors).toEqual([]);
  },
);
