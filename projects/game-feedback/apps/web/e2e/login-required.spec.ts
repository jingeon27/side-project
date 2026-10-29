import { expect, test } from './support/test';

for (const width of [320, 1440]) {
  test(`${width}px 비회원 액션은 로그인 안내를 먼저 표시하고 취소하면 현재 화면을 유지한다`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    for (const [path, name] of [
      ['/ko?q=hog&tab=unanswered', '글쓰기'],
      ['/ko/users/sample-user-3', '팔로우'],
      ['/ko/users/sample-user-3', '사용자 신고'],
      ['/ko/users/sample-user-3', '덱연구소님과 채팅하기'],
      ['/ko/posts/sample-post-0?board=feedback', '신고'],
      ['/ko/posts/sample-post-0?board=feedback', '차단'],
      ['/ko/posts/sample-post-0?board=feedback', '로그인하고 댓글 남기기'],
      ['/ko/posts/sample-post-0?board=feedback', '로그인하고 피드백 남기기'],
      ['/ko/contact', '관리자에게 문의하기'],
      ['/ko/contact', '프로필 인증 문의'],
    ] as const) {
      await page.goto(path);
      const action = page.getByRole('main').getByRole('button', { name, exact: true }).first();
      await action.click();
      const required = page.getByRole('dialog', { name: '로그인이 필요해요', exact: true });
      await expect(required, name).toBeVisible();
      await expect(required).toContainText('로그인 후 이 기능을 이용할 수 있어요.');
      await expect(page).toHaveURL(path);
      if (name === '글쓰기') {
        await expect(required).toHaveCSS('opacity', '1');
        await page.screenshot({
          path: testInfo.outputPath(`login-required-${width}.png`),
          animations: 'disabled',
        });
        const historyLength = await page.evaluate(() => history.length);
        await page.keyboard.press('Escape');
        await expect(required).toHaveCount(0);
        await expect(action).toBeFocused();
        expect(await page.evaluate(() => history.length)).toBe(historyLength);
        await action.click();
      }
      await required.getByRole('button', { name: '취소', exact: true }).click();
      await expect(required).toHaveCount(0);
      await expect(page).toHaveURL(path);
      await expect(action).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test('로그인 버튼은 안내 없이 로그인 절차를 바로 연다', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/ko/settings');
  await page.getByRole('button', { name: '로그인 / 시작하기', exact: true }).click();
  await expect(page).toHaveURL('/ko/login?returnTo=%2Fko%2Fsettings');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
