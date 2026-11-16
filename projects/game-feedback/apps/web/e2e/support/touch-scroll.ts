import type { CDPSession, Page } from '@playwright/test';

/** 프레임마다 터치 위치를 보내 실제 스크롤과 방향 전환을 검증한다. */
export async function touchScroll(
  page: Page,
  session: CDPSession,
  { x, fromY, toY }: { x: number; fromY: number; toY: number },
) {
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: fromY }],
  });
  for (const step of Array.from({ length: 12 }, (_, index) => index + 1)) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: fromY + ((toY - fromY) * step) / 12 }],
    });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
