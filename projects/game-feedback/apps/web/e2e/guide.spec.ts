import { expect, test } from '@playwright/test';

test('320px 모바일 가이드 제목과 화살표로 각 기능에 이동하고 돌아올 수 있어야 한다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const login = await page.request.post('/api/auth/test-token', {
    headers: { Origin: 'http://127.0.0.1:3301' },
    data: { accountId: 'sample-user-0' },
  });
  expect(login.ok()).toBe(true);
  await page.goto('/ko/guide');
  const guide = page.getByRole('article');
  await expect(guide.getByText(/화면 아래 홈/)).toBeVisible();
  await expect(guide.getByText(/휴대폰 키보드의 줄바꿈/)).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('guide-mobile-320.png'), animations: 'disabled' });
  for (const [title, path] of [
    ['전체와 다섯 분류', '/ko'],
    ['글쓰기와 사진·동영상', '/ko/write'],
    ['친추판매', '/ko/boards/friend-sale'],
    ['전투 모집', '/ko/boards/friendly'],
    ['코치와 수강생 모집', '/ko/boards/coaching'],
    ['채팅과 대화내역', '/ko/messages'],
    ['게임 계정과 프로필 인증', '/ko/settings'],
    ['팔로우와 새 소식', '/ko/notifications'],
    ['문의와 신고', '/ko/contact'],
  ] as const) {
    const link = guide.getByRole('heading', { name: title, exact: true }).getByRole('link');
    await expect(link).toHaveAttribute('href', path);
    await link.scrollIntoViewIfNeeded();
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await link.locator('svg').click();
    await expect(page).toHaveURL(path);
    await page.goBack();
    await expect(page).toHaveURL('/ko/guide');
  }
  const free = guide.getByRole('link', { name: '자유게시판', exact: true });
  await free.focus();
  await expect(free).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/ko/boards/free');
  expect(errors).toEqual([]);
});

for (const locale of ['en', 'ja'] as const) {
  test(`${locale} 모바일 가이드의 제목 링크가 언어를 유지하고 좁은 화면에 들어가야 한다`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(`/${locale}/guide`);
    const guide = page.getByRole('article');
    for (const heading of await guide.getByRole('heading', { level: 2 }).all()) {
      const link = heading.getByRole('link');
      await expect(link).toHaveAttribute('href', new RegExp(`^/${locale}(?:/|$)`));
      await expect(link.locator('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(await link.textContent()).not.toMatch(/[가-힣]/);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`guide-mobile-${locale}.png`),
      animations: 'disabled',
    });
    // 제목 자체를 탭했을 때도 이동하고 브라우저 뒤로 가기로 가이드에 복귀한다.
    const link = guide.getByRole('link', {
      name: locale === 'en' ? 'Support and reports' : 'お問い合わせと通報',
      exact: true,
    });
    await link.click();
    await expect(page).toHaveURL(`/${locale}/contact`);
    await page.goBack();
    await expect(page).toHaveURL(`/${locale}/guide`);
  });
}
