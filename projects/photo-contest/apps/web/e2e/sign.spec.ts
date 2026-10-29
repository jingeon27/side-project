import { expect, test } from './support/test';

test(
  '세션 없는 콘텐츠 진입과 만료된 세션은 인증 화면으로 보내고 원래 경로로 익명 시작해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, context }) => {
    for (const path of [
      '/',
      '/explore?q=test',
      '/groups/missing',
      '/groups/missing/write',
      '/invite/missing',
      '/contests/missing',
      '/me',
      '/notifications',
      '/onboarding',
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(
        (url) => url.pathname === '/sign' && url.searchParams.get('next') === path,
      );
      await expect(page.getByRole('button', { name: '익명으로 시작하기', exact: true })).toBeVisible();
      await expect(page.getByRole('tab', { name: '로그인', exact: true })).toBeVisible();
      await expect(page.getByRole('tab', { name: '회원가입', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: '로그인 없이 그룹 둘러보기' })).toHaveCount(0);
    }
    await context.addCookies([
      {
        name: 'contest_session',
        value: 'expired'.repeat(8),
        url: new URL(page.url()).origin,
        httpOnly: true,
      },
    ]);
    await page.goto('/me');
    await expect(page).toHaveURL((url) => url.pathname === '/sign' && url.searchParams.get('next') === '/me');
    await page.goto('/explore?q=anonymous');
    await expect(page).toHaveURL(/\/sign\?/);
    await page.getByRole('button', { name: '익명으로 시작하기', exact: true }).click();
    await expect(page).toHaveURL('/explore?q=anonymous');
    const session = (await context.cookies()).find((cookie) => cookie.name === 'contest_session');
    expect(session?.httpOnly).toBe(true);
    expect(session?.value).not.toBe('expired'.repeat(8));
    await page.reload();
    await expect(page).toHaveURL('/explore?q=anonymous');
  },
);
