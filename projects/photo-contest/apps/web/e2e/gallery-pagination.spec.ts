import { seedPost } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test('뒷페이지까지 읽은 뒤 삭제해도 남은 게시물을 계속 불러올 수 있어야 한다', async ({ page, signIn }) => {
  const cookie = await signIn('갤러리 페이지 사용자');
  const group = await seedGroup(cookie, '상시 게시판');
  for (let index = 0; index < 27; index++) await seedPost(cookie, group.id, `페이지 ${index}`);
  await page.goto(`/groups/${group.id}`);
  const latest = page.getByRole('region', { name: '최신 게시물', exact: true });
  await expect(latest.getByRole('article')).toHaveCount(24);
  await latest.getByRole('button', { name: '게시물 더 보기' }).click();
  await expect(latest.getByRole('article')).toHaveCount(27);
  await latest
    .getByRole('article', { name: '페이지 0', exact: true })
    .getByRole('button', { name: '페이지 0 삭제' })
    .click();
  await page.getByRole('alertdialog').getByRole('button', { name: '게시물 삭제하기' }).click();
  await expect(latest.getByRole('article')).toHaveCount(24);
  await latest.getByRole('button', { name: '게시물 더 보기' }).click();
  await expect(latest.getByRole('article')).toHaveCount(26);
  await expect(latest.getByRole('article', { name: '페이지 1', exact: true })).toBeVisible();
  await expect(latest.getByRole('article', { name: '페이지 0', exact: true })).toHaveCount(0);
});
