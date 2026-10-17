import { test, expect } from '@playwright/test';

test('detail back and tab replacement restore the filtered feed without a tab history loop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ko?q=%ED%98%B8%EA%B7%B8');
  await expect(page.locator('.post-card').first()).toBeVisible();
  await page.locator('.post-card').first().getByRole('heading').click();
  await expect(page).toHaveURL(/\/ko\/posts\//);
  await page
    .getByRole('link', { name: '피드', exact: true })
    .filter({ has: page.locator('svg') })
    .first()
    .click();
  await expect(page).toHaveURL(/\/ko\?q=%ED%98%B8%EA%B7%B8$/);
  await expect(page.getByRole('textbox', { name: '게시글 검색' })).toHaveValue('호그');
  const length = await page.evaluate(() => history.length);
  const tabs = page.getByRole('navigation', { name: '모바일 메뉴' });
  await tabs.getByRole('link', { name: '내 프로필' }).click();
  await expect(page).toHaveURL(/\/ko\/settings$/);
  await tabs.getByRole('link', { name: '알림' }).click();
  await expect(page).toHaveURL(/\/ko\/notifications$/);
  await tabs.getByRole('link', { name: '피드' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/ko\?q=%ED%98%B8%EA%B7%B8$/);
  expect(await page.evaluate(() => history.length)).toBe(length);
});

test('nested conversations preserve the inbox layout and replace sibling rooms; old URLs redirect', async ({
  page,
}) => {
  const login = await page.request.post('/api/auth/test-login', {
    headers: { Origin: 'http://127.0.0.1:3301' },
    data: { accountId: 'sample-user-0' },
  });
  expect(login.ok()).toBe(true);
  const response = await page.request.post('/api/conversations', {
    headers: { Origin: 'http://127.0.0.1:3301' },
    data: { recipientId: 'sample-test-admin' },
  });
  expect(response.ok()).toBe(true);
  const room = await response.json();
  await page.goto('/ko/messages');
  const sidebar = page.getByRole('complementary', { name: '내 대화 목록' });
  await expect(sidebar).toBeVisible();
  await sidebar.evaluate((node) => node.setAttribute('data-route-persistence', 'kept'));
  await page.getByTestId('conversation-sample-conversation-0-3').click();
  await expect(page).toHaveURL(/\/ko\/messages\/sample-conversation-0-3$/);
  await expect(sidebar).toHaveAttribute('data-route-persistence', 'kept');
  await page.getByTestId(`conversation-${room.id}`).click();
  await expect(page).toHaveURL(new RegExp(`/ko/messages/${room.id}$`));
  await expect(sidebar).toHaveAttribute('data-route-persistence', 'kept');
  await page.goBack();
  await expect(page).toHaveURL(/\/ko\/messages$/);
  await page.goto('/ko/messages?conversation=sample-conversation-0-3');
  await expect(page).toHaveURL(/\/ko\/messages\/sample-conversation-0-3$/);
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://feedback.example/ko/messages/sample-conversation-0-3',
  );
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', /noindex, nofollow/);
});
