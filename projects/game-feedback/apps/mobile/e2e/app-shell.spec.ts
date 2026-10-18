import { test, expect } from './support/fixtures';
import { ORIGIN } from './support/native-host';

test('WebView test account persists posts, comments and private chat across reload', async ({
  page,
  nativeHost,
}, testInfo) => {
  const suffix = Date.now().toString(36);
  await page.goto('/ko');
  await expect.poll(nativeHost.isReady).toBe(true);
  await page.getByRole('button', { name: '글쓰기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '로그인', exact: true })).toBeVisible();
  await page.request.post('/api/auth/test-token', {
    headers: { Origin: ORIGIN },
    data: { accountId: 'sample-user-0' },
  });
  nativeHost.state('background');
  nativeHost.state('active');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.header-account')).toContainText('새벽의호그');
  await expect.poll(nativeHost.hasOverlay).toBe(false);
  await page.getByRole('button', { name: '글쓰기', exact: true }).click();
  const composer = page.getByRole('form', { name: '글쓰기', exact: true });
  const title = `모바일에서 작성한 피드백 ${suffix}`;
  await composer.getByLabel('제목', { exact: true }).fill(title);
  await composer
    .getByRole('textbox', { name: /플레이와 고민/ })
    .fill('모바일 웹뷰에서도 호그 순환 덱의 수비 타이밍과 반대 라인 공격을 함께 이야기하고 싶어요.');
  const creation = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/posts' && response.request().method() === 'POST',
  );
  await composer.getByRole('button', { name: '피드백 요청 올리기', exact: true }).click();
  const created = await creation;
  expect(created.ok()).toBe(true);
  const post = await created.json();
  await expect(page).toHaveURL(new RegExp(`/ko/posts/${post.id}$`), { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const comment = `모바일 댓글 ${suffix}`;
  await page.getByRole('textbox', { name: '댓글 내용' }).fill(comment);
  await page.getByRole('button', { name: '댓글 등록', exact: true }).click();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  const session = await (await page.request.get('/api/session')).json();
  expect(session.user).toMatchObject({ id: 'sample-user-0', supercellTag: '#2PP' });
  const roomResponse = await page.request.post('/api/conversations', {
    headers: { Origin: ORIGIN },
    data: { recipientId: 'sample-user-3' },
  });
  expect(roomResponse.ok()).toBe(true);
  const room = await roomResponse.json();
  expect(nativeHost.openDeepLink(`gamefeedback://ko/messages?conversation=${room.id}`)).toBe(true);
  const message = `모바일 웹뷰 채팅 ${suffix}`;
  await page.getByRole('textbox', { name: '메시지 내용' }).fill(message);
  await page.getByRole('button', { name: '보내기', exact: true }).click();
  await expect(
    page.getByRole('log', { name: '대화 메시지' }).getByText(message, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('log', { name: '대화 메시지' }).getByText(message, { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/chat-${testInfo.project.name}.png`, fullPage: true });
});

test('native back closes the web dialog, deep links keep the document, and foreground refreshes the session', async ({
  page,
  nativeHost,
}) => {
  await page.goto('/ko');
  await expect.poll(nativeHost.isReady).toBe(true);
  await page.getByRole('button', { name: '글쓰기', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await nativeHost.requestBack()).toBe(true);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(nativeHost.openDeepLink('gamefeedback://ko/guide')).toBe(true);
  await expect(page).toHaveURL(/\/ko\/guide$/);
  expect(nativeHost.openDeepLink('gamefeedback://ko/posts/%2Fetc')).toBe(false);
  expect(await nativeHost.requestBack()).toBe(true);
  await expect(page).toHaveURL(/\/ko$/);
  expect(await nativeHost.requestBack()).toBe(true);
  expect(nativeHost.rootBacks()).toBe(1);
  const result = await page.request.post('/api/auth/test-login', {
    headers: { Origin: ORIGIN },
    data: { accountId: 'sample-user-3' },
  });
  expect(result.ok()).toBe(true);
  nativeHost.state('background');
  nativeHost.state('active');
  await expect(page.locator('.header-account')).toContainText('덱연구소');
  expect(nativeHost.openDeepLink('gamefeedback://ko/settings')).toBe(true);
  await expect(page.locator('.settings-profile')).toContainText('덱연구소');
  await expect(page.locator('.settings-profile')).toContainText('인증 유저');
});

test('native Google login opens the system auth session and cancellation keeps the login dialog usable', async ({
  page,
  nativeHost,
}) => {
  await page.route('**/api/session', async (route) => {
    const response = await route.fetch();
    const session = await response.json();
    await route.fulfill({
      response,
      json: {
        ...session,
        googleConfigured: true,
        socialProviders: [{ provider: 'google', configured: true }],
      },
    });
  });
  await page.goto('/ko');
  await expect.poll(nativeHost.isReady).toBe(true);
  await page.getByRole('button', { name: '글쓰기', exact: true }).click();
  await page.getByRole('button', { name: /Google로 시작하기/ }).click();
  await expect.poll(() => nativeHost.authSessions.length).toBe(1);
  expect(nativeHost.authSessions[0]).toMatch(/\/api\/auth\/social\/google\?app_challenge=[A-Za-z0-9_-]{43}$/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.request.post('/api/auth/test-token', {
    headers: { Origin: ORIGIN },
    data: { accountId: 'sample-user-0' },
  });
  nativeHost.state('background');
  nativeHost.state('active');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('native back dismisses the conversation menu and report dialog before leaving the chat', async ({
  page,
  nativeHost,
}) => {
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: ORIGIN },
    data: { accountId: 'sample-user-0' },
  });
  const path = '/ko/messages/sample-conversation-0-3';
  await page.goto(path);
  await expect.poll(nativeHost.currentPath).toBe(path);
  const menu = page.getByRole('button', { name: '대화 메뉴', exact: true });
  await menu.click();
  await expect(page.getByRole('menu')).toBeVisible();
  expect(await nativeHost.requestBack()).toBe(true);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect.poll(nativeHost.currentPath).toBe(path);
  await page.getByRole('button', { name: '사용자 신고', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await nativeHost.requestBack()).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(nativeHost.currentPath).toBe(path);
});
