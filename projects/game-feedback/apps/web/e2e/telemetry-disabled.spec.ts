import { test, expect } from '@playwright/test';
test('관측 키가 없는 기본 테스트 환경은 외부 관측 요청을 보내지 않아야 한다', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/amplitude\.com|sentry\.io|sentry\.invalid/.test(request.url())) requests.push(request.url());
  });
  await page.goto('/ko');
  await expect(page.getByRole('banner')).toBeVisible();
  await page.goto('/ko/privacy');
  await expect(page.getByRole('main')).toBeVisible();
  expect(requests).toEqual([]);
});
