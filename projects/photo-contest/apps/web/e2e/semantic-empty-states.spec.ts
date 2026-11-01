import { expect, seedGroup, test } from './support/test';
import { emptyStateScreens } from './support/web-screens';

test(
  '빈 게시물·내 콘텐츠·그룹·대회는 각 성격의 아이콘으로 구분돼야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const viewer = await signIn('빈 화면 아이콘 확인');
    await page.goto('/me');
    await expect(page.getByRole('region', { name: '참여 그룹' }).locator('.lucide-users')).toBeVisible();
    await expect(
      page.getByRole('region', { name: '올린 게시물' }).locator('.lucide-file-image'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '그룹 만들기', exact: true })).toBeEnabled();
    await emptyStateScreens.ownPosts(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('empty-content-groups.png'), animations: 'disabled' });
    const group = await seedGroup(viewer, '아이콘 확인용 그룹', 'PUBLIC');
    const path = `/groups/${group.id}`;
    await page.goto(path);
    await expect(
      page.getByRole('region', { name: '최신 게시물', exact: true }).locator('.lucide-images'),
    ).toBeVisible();
    await page.goto(`${path}/contests`);
    await expect(emptyStateScreens.emptyContests(page)).toBeVisible();
    await page.goto(`${path}/hall-of-fame`);
    await expect(emptyStateScreens.emptyHallOfFame(page)).toBeVisible();
  },
);
