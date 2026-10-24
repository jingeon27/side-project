import { expect, test } from '@playwright/test';

const origin = process.env.GF_E2E_WEB_ORIGIN ?? 'http://127.0.0.1:3301';
const headers = { Origin: origin };

test('following a player delivers new posts, persists notification preferences and counts public visits', async ({
  browser,
}) => {
  const follower = await browser.newContext({ baseURL: origin });
  const author = await browser.newContext({ baseURL: origin });
  const guest = await browser.newContext({ baseURL: origin });
  try {
    for (const [context, accountId] of [
      [follower, 'sample-user-0'],
      [author, 'sample-user-3'],
    ] as const) {
      expect(
        (await context.request.post('/api/auth/test-token', { headers, data: { accountId } })).ok(),
      ).toBe(true);
    }
    await follower.request.delete('/api/users/sample-user-3/follow', { headers });
    const page = await follower.newPage();
    await page.setViewportSize({ width: 400, height: 844 });
    await page.goto('/ko/users/sample-user-3');
    await page.getByRole('button', { name: '팔로우', exact: true }).click();
    await expect(page.getByRole('button', { name: '팔로잉', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: '새 글 알림 켜짐', exact: true })).toBeVisible();
    const title = `팔로우한 플레이어의 새 이야기 ${Date.now().toString(36)}`;
    const created = await author.request.post('/api/posts', {
      headers,
      data: {
        board: 'FREE',
        title,
        body: '친구와 함께 연습한 이야기를 공유해요.',
        categoryId: 'clash-royale',
      },
    });
    expect(created.ok()).toBe(true);
    const post = await created.json();
    await page.getByRole('banner').getByRole('link', { name: /^알림/ }).click();
    const notification = page.locator('.notification-item:visible').filter({ hasText: title });
    await expect(notification).toContainText('팔로우한 사용자의 새 글');
    await notification.click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.locator('.post-publication:visible')).toContainText('등록일시');
    await expect
      .poll(async () => (await (await page.request.get(`/api/posts/${post.id}`)).json()).post.viewCount)
      .toBe(1);
    await page.reload();
    await expect(page.locator('.post-publication:visible')).toContainText('조회수1');
    const guestPage = await guest.newPage();
    await guestPage.goto(`/ko/posts/${post.id}`);
    await expect(guestPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect
      .poll(async () => (await (await guest.request.get(`/api/posts/${post.id}`)).json()).post.viewCount)
      .toBe(2);
    await page.goto('/ko/users/sample-user-3');
    await page.getByRole('button', { name: '새 글 알림 켜짐', exact: true }).click();
    await expect(page.getByRole('button', { name: '새 글 알림 꺼짐', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await page.reload();
    await expect(page.getByRole('button', { name: '새 글 알림 꺼짐', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '팔로잉', exact: true }).click();
    await expect(page.getByRole('button', { name: '팔로우', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await follower.request.delete('/api/users/sample-user-3/follow', { headers });
    await Promise.all([follower.close(), author.close(), guest.close()]);
  }
});

for (const width of [400, 1440]) {
  test(`input popups use responsive sheets and confirmation dialogs contain only actions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    expect(
      (
        await page.request.post('/api/auth/test-token', { headers, data: { accountId: 'sample-user-0' } })
      ).ok(),
    ).toBe(true);
    await page.goto('/ko/settings');
    await page.getByRole('button', { name: '계정 등록', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toHaveClass(/bottom-sheet-content/);
    await expect(sheet).toHaveCSS('opacity', '1');
    await expect
      .poll(async () => {
        const bounds = await sheet.locator('.ds-sheet-frame').boundingBox();
        if (!bounds) return null;
        return Math.round(bounds.y + bounds.height / (width < 768 ? 1 : 2));
      })
      .toBe(width < 768 ? 900 : 450);
    await sheet.getByLabel('플레이어 태그', { exact: true }).fill('#GG829JGY');
    await sheet.getByRole('button', { name: '취소', exact: true }).click();
    await page.goto('/ko/messages/sample-conversation-0-3');
    await expect(page.getByRole('textbox', { name: '메시지 내용' })).toBeVisible();
    await page.getByRole('button', { name: '사용자 신고', exact: true }).click();
    await expect(sheet).toHaveClass(/bottom-sheet-content/);
    await sheet.getByLabel('신고 사유', { exact: true }).selectOption('FRAUD');
    await sheet.getByRole('button', { name: '취소', exact: true }).click();
    await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
    await page.getByRole('menuitem', { name: '대화내역 삭제', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: '대화내역 삭제', exact: true });
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole('textbox')).toHaveCount(0);
    await expect(confirmation.getByRole('button')).toHaveCount(2);
    await expect(confirmation.getByRole('button', { name: '취소', exact: true })).toBeVisible();
    await confirmation.getByRole('button', { name: '취소', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
