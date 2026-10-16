import { test, expect } from './support/fixtures';
import { ORIGIN } from './support/native-host';
import { appRoutes } from '@game-feedback/bridge';

test('cold detail back uses the parent and reports root exit without replaying tab history', async ({
  page,
  nativeHost,
}) => {
  await page.goto('/ko/posts/sample-post-0');
  await expect.poll(nativeHost.currentPath).toBe('/ko/posts/sample-post-0');
  expect(await nativeHost.requestBack()).toBe(true);
  await expect(page).toHaveURL(/\/ko$/);
  expect(await nativeHost.requestBack()).toBe(true);
  expect(nativeHost.rootBacks()).toBe(1);
});

test('query locations, warm nested links and duplicate opens preserve the current document', async ({
  page,
  nativeHost,
}) => {
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: ORIGIN },
    data: { accountId: 'sample-user-0' },
  });
  await page.goto('/ko?q=%ED%98%B8%EA%B7%B8');
  await expect.poll(nativeHost.currentPath).toBe(appRoutes.feed('ko', { q: '호그' }));
  await page.getByRole('tab', { name: '답변을 기다려요' }).click();
  await expect.poll(nativeHost.currentPath).toBe(appRoutes.feed('ko', { q: '호그', tab: 'unanswered' }));
  await page.evaluate(() => document.documentElement.setAttribute('data-route-document', 'kept'));
  expect(nativeHost.openDeepLink('gamefeedback://ko/messages?conversation=sample-conversation-0-3')).toBe(
    true,
  );
  await expect(page).toHaveURL(/\/ko\/messages\/sample-conversation-0-3$/);
  await expect.poll(nativeHost.currentPath).toBe('/ko/messages/sample-conversation-0-3');
  const length = await page.evaluate(() => history.length);
  expect(nativeHost.openDeepLink('gamefeedback://ko/messages/sample-conversation-0-3')).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-route-document', 'kept');
  expect(await page.evaluate(() => history.length)).toBe(length);
  expect(await nativeHost.requestBack()).toBe(true);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/ko' &&
      url.searchParams.get('tab') === 'unanswered' &&
      url.searchParams.get('q') === '호그',
  );
});
