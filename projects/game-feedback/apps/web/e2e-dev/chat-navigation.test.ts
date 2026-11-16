import { expect, test } from '@playwright/test';

test('채팅 목록과 대화를 처음 열고 왕복할 때 use 경고가 없어야 한다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const login = await page.request.post('/api/auth/test-login', {
    headers: { Origin: 'http://127.0.0.1:3301' },
    data: { accountId: 'sample-user-0' },
  });
  expect(login.ok()).toBe(true);
  await page.goto('/ko');
  await page.getByRole('link', { name: /^채팅(?: \d+개)?$/ }).click();
  await expect(page.getByRole('heading', { name: '내 메시지', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /^덱연구소님과의 대화/ }).click();
  const composer = page.getByRole('textbox', { name: '메시지 내용', exact: true });
  await composer.fill('전송하지 않은 초안');
  await expect(composer).toHaveValue('전송하지 않은 초안');
  await page.getByRole('link', { name: /^채팅(?: \d+개)?$/ }).click();
  await expect(page.getByRole('heading', { name: '내 메시지', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
