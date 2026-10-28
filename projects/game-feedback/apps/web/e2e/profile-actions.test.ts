import { expect, test, type Page } from './support/test';

const origin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3301';

async function expectAlignedActions(page: Page, following: boolean) {
  const follow = page.getByRole('button', { name: following ? '팔로잉' : '팔로우', exact: true });
  const chat = page.getByRole('button', { name: '덱연구소님과 채팅하기', exact: true });
  const report = page.getByRole('button', { name: '사용자 신고', exact: true });
  await expect(follow).toBeVisible();
  await expect(chat).toBeVisible();
  await expect(report).toBeVisible();
  const boxes = await Promise.all([follow, chat, report].map((button) => button.boundingBox()));
  const [first, second, last] = boxes;
  if (!first || !second || !last) throw new Error('Profile actions must be visible.');
  for (const box of boxes) {
    expect(box?.height).toBe(44);
    expect(Math.abs((box?.y ?? 0) - first.y)).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(first.width - second.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(second.x - first.x - first.width - 8)).toBeLessThanOrEqual(1);
  expect(Math.abs(last.x - second.x - second.width - 8)).toBeLessThanOrEqual(1);
  expect(last.width).toBe(44);
  await expect(report).toHaveText('');
  await expect(report.locator('svg')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (following) {
    const notifications = await page
      .getByRole('button', { name: '새 글 알림 켜짐', exact: true })
      .boundingBox();
    expect(notifications?.y).toBeGreaterThanOrEqual(first.y + first.height + 7);
    expect(notifications?.x).toBe(first.x);
  }
}

for (const signedIn of [false, true]) {
  test(`공개 프로필 동작은 높이와 간격을 맞추고 신고는 아이콘으로 표시한다 (${signedIn ? '회원' : '비회원'})`, async ({
    page,
  }, testInfo) => {
    if (signedIn) {
      expect(
        (
          await page.request.post('/api/auth/test-login', {
            headers: { Origin: origin },
            data: { accountId: 'sample-user-0' },
          })
        ).ok(),
      ).toBe(true);
      expect(
        (await page.request.delete('/api/users/sample-user-3/follow', { headers: { Origin: origin } })).ok(),
      ).toBe(true);
    }
    await page.goto('/ko/users/sample-user-3');
    for (const width of [320, 400, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectAlignedActions(page, false);
      const back = await page
        .getByRole('banner')
        .getByRole('link', { name: '돌아가기', exact: true })
        .boundingBox();
      const title = await page.locator('.profile-topbar .mobile-page-title').boundingBox();
      expect((title?.x ?? 0) - (back?.x ?? 0) - (back?.width ?? 0)).toBe(4);
    }
    if (signedIn) {
      await page.getByRole('button', { name: '팔로우', exact: true }).click();
      await expect(page.getByRole('button', { name: '팔로잉', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      for (const width of [320, 400, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expectAlignedActions(page, true);
      }
    }
    await page.getByRole('button', { name: '사용자 신고', exact: true }).click();
    const dialog = page.getByRole('dialog', {
      name: signedIn ? '어떤 문제가 있나요?' : '로그인이 필요해요',
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.setViewportSize({ width: 400, height: 900 });
    await page.screenshot({ path: testInfo.outputPath('profile-actions.png'), fullPage: false });
    await page.goto('/ko/posts/sample-post-0?board=feedback');
    for (const width of [320, 400, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const back = await page
        .getByRole('banner')
        .getByRole('link', { name: '돌아가기', exact: true })
        .boundingBox();
      const title = await page.getByRole('navigation', { name: '게시글 경로', exact: true }).boundingBox();
      expect((title?.x ?? 0) - (back?.x ?? 0) - (back?.width ?? 0)).toBe(4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
