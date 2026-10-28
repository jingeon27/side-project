import { expect, test } from '@playwright/test';

const origin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3301';

test('profile drafts survive cancelled links and back navigation and saved changes leave without a prompt', async ({
  page,
}) => {
  const login = await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  expect(login.ok()).toBe(true);
  await page.goto('/ko/users/sample-user-0');
  await page.getByRole('link', { name: '프로필 수정', exact: true }).click();
  await expect(page).toHaveURL('/ko/settings/profile');
  const bio = page.getByRole('textbox', { name: '자기소개', exact: true });
  const originalBio = await bio.inputValue();
  await bio.fill('저장하지 않은 프로필 소개');
  const dismiss = async (action: () => Promise<unknown>) => {
    const dialog = page.waitForEvent('dialog');
    const pending = action();
    const confirmation = await dialog;
    expect(confirmation.type()).toBe('confirm');
    expect(confirmation.message()).toContain('저장하지 않은 변경');
    await confirmation.dismiss();
    await pending;
    await expect(page).toHaveURL('/ko/settings/profile');
    await expect(bio).toHaveValue('저장하지 않은 프로필 소개');
  };
  await dismiss(() =>
    page
      .getByRole('navigation', { name: '주 메뉴', exact: true })
      .getByRole('link', { name: '홈', exact: true })
      .click(),
  );
  await dismiss(() => page.evaluate(() => history.back()));
  await dismiss(() => page.getByRole('link', { name: '돌아가기', exact: true }).click());
  const dialog = page.waitForEvent('dialog');
  const back = page.evaluate(() => history.back());
  await (await dialog).accept();
  await back;
  await expect(page).toHaveURL('/ko/users/sample-user-0');
  await page.getByRole('link', { name: '프로필 수정', exact: true }).click();
  await expect(bio).toHaveValue(originalBio);
  await bio.fill('저장한 프로필 소개');
  const unexpectedDialog = async (confirmation: import('@playwright/test').Dialog) => {
    await confirmation.dismiss();
    throw new Error('저장 후에는 이탈 확인을 표시하지 않아야 한다.');
  };
  page.on('dialog', unexpectedDialog);
  await page.getByRole('button', { name: '프로필 저장', exact: true }).click();
  await expect(page).toHaveURL('/ko/users/sample-user-0');
  await expect(page.getByText('저장한 프로필 소개', { exact: true })).toBeVisible();
  page.off('dialog', unexpectedDialog);
});

test('desktop navigation has one entry per destination and keeps boards in the sidebar', async ({ page }) => {
  const login = await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  expect(login.ok()).toBe(true);
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ko');
    const header = page.getByRole('banner');
    const primary = page.getByRole('navigation', { name: '주 메뉴', exact: true });
    await expect(header.getByRole('link', { name: '프로필', exact: true })).toBeVisible();
    await expect(header.locator('.header-actions').getByRole('link')).toHaveCount(3);
    await expect(header.getByRole('combobox', { name: '언어 설정', exact: true })).toBeVisible();
    await expect(primary.getByRole('link')).toHaveCount(2);
    await expect(page.getByRole('link', { name: '홈', exact: true })).toHaveCount(1);
    await expect(primary.getByRole('link', { name: '가이드', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^채팅(?: \d+개)?$/ })).toHaveCount(1);
    const boards = page.getByRole('navigation', { name: '클래시로얄 게시판', exact: true });
    await expect(boards).toHaveCount(1);
    await header.getByRole('link', { name: '프로필', exact: true }).click();
    await expect(page).toHaveURL(/\/ko\/settings$/);
    await boards.getByRole('link', { name: '전투 모집', exact: true }).click();
    await expect(page).toHaveURL(/\/ko\/boards\/friendly$/);
    await expect(boards.getByRole('link', { name: '전투 모집', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('detail back and tab replacement restore the filtered feed without a tab history loop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ko?q=%ED%98%B8%EA%B7%B8');
  await expect(page.locator('.post-card').first()).toBeVisible();
  await page.locator('.post-card').first().getByRole('heading').click();
  await expect(page).toHaveURL(/\/ko\/posts\//);
  await page
    .getByRole('link', { name: '홈', exact: true })
    .filter({ has: page.locator('svg') })
    .first()
    .click();
  await expect(page).toHaveURL(/\/ko\?q=%ED%98%B8%EA%B7%B8$/);
  await expect(page.getByRole('banner').getByRole('link', { name: '검색', exact: true })).toHaveAttribute(
    'href',
    '/ko/search?q=%ED%98%B8%EA%B7%B8',
  );
  const length = await page.evaluate(() => history.length);
  const tabs = page.getByRole('navigation', { name: '모바일 메뉴' });
  await tabs.getByRole('link', { name: '프로필', exact: true }).click();
  await expect(page).toHaveURL(/\/ko\/settings$/);
  await page.getByRole('banner').getByRole('link', { name: '알림 0개', exact: true }).click();
  await expect(page).toHaveURL(/\/ko\/notifications$/);
  await tabs.getByRole('link', { name: '홈' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/ko\?q=%ED%98%B8%EA%B7%B8$/);
  expect(await page.evaluate(() => history.length)).toBe(length);
});

test('nested conversations preserve the inbox layout and replace sibling rooms; old URLs redirect', async ({
  page,
}) => {
  const login = await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  expect(login.ok()).toBe(true);
  const response = await page.request.post('/api/conversations', {
    headers: { Origin: origin },
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

for (const width of [400, 1440]) {
  test(`guide scroll does not carry into chat and its regions stay separated at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-0' },
    });
    await page.goto('/ko/guide');
    await expect(page.getByRole('heading', { name: '문의와 신고', exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const menu =
      width <= 760
        ? page.locator('.mobile-nav')
        : page.getByRole('navigation', { name: '주 메뉴', exact: true });
    await menu.getByRole('link', { name: /^채팅(?: \d+개)?$/ }).click();
    await expect(page).toHaveURL('/ko/messages');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole('complementary', { name: '내 대화 목록' })).toBeVisible();
    const workspace = await page.locator('.chat-workspace').boundingBox();
    expect(workspace?.y).toBeGreaterThanOrEqual((await page.getByRole('banner').boundingBox())?.height ?? 0);
    expect((workspace?.y ?? 0) + (workspace?.height ?? 0)).toBeLessThanOrEqual(844);
    await page.getByTestId('conversation-sample-conversation-0-3').click();
    await expect(page.getByRole('textbox', { name: '메시지 내용', exact: true })).toBeVisible();
    const regions = await page.locator('.conversation-pane').evaluate((node) => {
      const history = node.querySelector('.chat-message-scroll');
      const heading = node.querySelector('.conversation-heading');
      const compose = node.querySelector('.chat-compose-area');
      if (!history || !heading || !compose) throw Error('Missing chat region');
      return {
        history: getComputedStyle(history).backgroundColor,
        heading: getComputedStyle(heading).backgroundColor,
        compose: getComputedStyle(compose).backgroundColor,
        headerBottom: heading.getBoundingClientRect().bottom,
        historyTop: history.getBoundingClientRect().top,
        historyBottom: history.getBoundingClientRect().bottom,
        composeTop: compose.getBoundingClientRect().top,
      };
    });
    expect(regions.history).not.toBe(regions.heading);
    expect(regions.history).not.toBe(regions.compose);
    expect(regions.historyTop).toBeGreaterThanOrEqual(regions.headerBottom);
    expect(regions.historyBottom).toBeLessThanOrEqual(regions.composeTop + 1);
  });
}
