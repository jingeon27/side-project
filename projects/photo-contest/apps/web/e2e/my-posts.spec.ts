import { productRequest } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  'MY에서 올린 게시물을 그룹별로 필터하고 새로고침·수정·삭제 후에도 목록을 유지해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const cookie = await signIn(`MY-${Date.now().toString(36)}`);
    const first = await seedGroup(cookie, 'MY 첫 그룹');
    const second = await seedGroup(cookie, 'MY 두 번째 그룹');
    for (const [groupId, title] of [
      [first.id, '첫 그룹 사진'],
      [second.id, '두 번째 그룹 사진'],
    ]) {
      await productRequest(
        cookie,
        'mutation($group:ID!,$title:String!){createPost(groupId:$group,title:$title,linkUrl:"https://example.com/photo",rightsConfirmed:true){id}}',
        { group: groupId, title },
      );
    }
    await page.goto('/me');
    const posts = page.getByRole('region', { name: '올린 게시물', exact: true });
    await expect(posts.getByRole('article')).toHaveCount(2);
    await posts.getByRole('button', { name: 'MY 두 번째 그룹', exact: true }).click();
    await expect(page).toHaveURL(`/me?group=${second.id}`);
    await expect(posts.getByRole('article')).toHaveCount(1);
    await expect(posts.getByRole('article', { name: '두 번째 그룹 사진', exact: true })).toBeVisible();
    await page.reload();
    await expect(posts.getByRole('button', { name: 'MY 두 번째 그룹', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await posts.getByRole('button', { name: '두 번째 그룹 사진 더보기', exact: true }).click();
    await page.getByRole('menuitem', { name: '수정', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '게시물 수정', exact: true });
    await editor.getByRole('textbox', { name: '제목', exact: true }).fill('수정한 내 사진');
    await editor.getByRole('button', { name: '수정 저장하기', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(posts.getByRole('article', { name: '수정한 내 사진', exact: true })).toBeVisible();
    await posts.getByRole('button', { name: '수정한 내 사진 더보기', exact: true }).click();
    await page.getByRole('menuitem', { name: '삭제', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '게시물 삭제하기', exact: true }).click();
    await expect(posts.getByText('이 그룹에 올린 게시물이 없어요', { exact: true })).toBeVisible();
    await posts.getByRole('button', { name: '전체 그룹', exact: true }).click();
    await expect(posts.getByRole('article')).toHaveCount(1);
    await expect(posts.getByRole('article', { name: '첫 그룹 사진', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  },
);
