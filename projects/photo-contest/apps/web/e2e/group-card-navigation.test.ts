import { expect, seedGroup, startAnonymousSession, test } from './support/test';

test(
  '공개 그룹의 둘러보기와 카드 본문을 누르면 해당 그룹으로 이동해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, context, signIn }, testInfo) => {
    const owner = await signIn('카드 이동 그룹장');
    const name = `둘러보기-${testInfo.project.name}-${Date.now()}`;
    const group = await seedGroup(owner, name);
    await context.clearCookies();
    await startAnonymousSession(context);
    const searchPath = `/explore?q=${encodeURIComponent(name)}`;
    await page.goto(searchPath);
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await card.getByText('둘러보기', { exact: true }).click();
    await expect(page).toHaveURL(`/groups/${group.id}`);
    await page.goto(searchPath);
    await card.getByText('멤버 1명', { exact: true }).click();
    await expect(page).toHaveURL(`/groups/${group.id}`);
    await page.goto(searchPath);
    await card.getByRole('link', { name, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/groups/${group.id}`);
  },
);

test(
  '익명 사용자가 비공개 그룹의 둘러보기를 누르면 로그인 안내 후 이동해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, context, signIn }, testInfo) => {
    const owner = await signIn('비공개 카드 그룹장');
    const name = `비공개 카드-${testInfo.project.name}-${Date.now()}`;
    const group = await seedGroup(owner, name, 'PRIVATE');
    await context.clearCookies();
    await startAnonymousSession(context);
    const searchPath = `/explore?q=${encodeURIComponent(name)}`;
    await page.goto(searchPath);
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await card.getByText('둘러보기', { exact: true }).click();
    const dialog = page.getByRole('alertdialog', { name: '로그인이 필요해요', exact: true });
    await expect(dialog).toContainText('비공개 그룹은 익명으로 이용할 수 없어요.');
    await expect(page).toHaveURL(searchPath);
    await expect(page.getByRole('region', { name: '최신 게시물', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: '로그인하기', exact: true }).click();
    await expect(page).toHaveURL(
      (url) => url.pathname === '/sign' && url.searchParams.get('next') === `/groups/${group.id}`,
    );
  },
);
