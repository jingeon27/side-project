import { seedPost } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test('그룹, MY, 공개 갤러리의 뒷페이지를 스크롤로 이어 읽어야 한다 @ios @desktop', async ({
  page,
  signIn,
}) => {
  const cookie = await signIn('그룹 페이지 사용자');
  const group = await seedGroup(cookie, '상시 게시판');
  for (let index = 0; index < 27; index++) await seedPost(cookie, group.id, `페이지 ${index}`);
  const nextPages: Array<[string, number]> = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/backend/graphql') return;
    const { operationName, variables } = request.postDataJSON();
    if (
      (operationName === 'GalleryPosts' && variables.groupId === group.id) ||
      operationName === 'MyGalleryPosts' ||
      operationName === 'PublicGalleryPosts'
    ) {
      if (variables.offset > 0) nextPages.push([operationName, variables.offset]);
    }
  });
  await page.goto(`/groups/${group.id}`);
  const latest = page.getByRole('region', { name: '최신 게시물', exact: true });
  const posts = latest.getByRole('article');
  const firstPageEnd = latest.getByRole('article', { name: '페이지 3', exact: true });
  await expect(posts).toHaveCount(24);
  await expect(latest.getByRole('button', { name: '게시물 더 보기' })).toHaveCount(0);
  expect(nextPages).toEqual([]);
  await firstPageEnd.scrollIntoViewIfNeeded();
  await expect(posts).toHaveCount(27);
  expect(nextPages).toEqual([['GalleryPosts', 24]]);
  await latest
    .getByRole('article', { name: '페이지 0', exact: true })
    .getByRole('button', { name: '페이지 0 더보기' })
    .click();
  await page.getByRole('menuitem', { name: '삭제', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '게시물 삭제하기' }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await firstPageEnd.scrollIntoViewIfNeeded();
  await expect(posts).toHaveCount(26);
  expect(nextPages).toEqual([
    ['GalleryPosts', 24],
    ['GalleryPosts', 24],
  ]);
  await expect(latest.getByRole('article', { name: '페이지 1', exact: true })).toBeVisible();
  await expect(latest.getByRole('article', { name: '페이지 0', exact: true })).toHaveCount(0);

  await page.goto('/me');
  const myPosts = page.getByRole('region', { name: '올린 게시물', exact: true }).getByRole('article');
  await expect(myPosts).toHaveCount(24);
  await myPosts.nth(23).scrollIntoViewIfNeeded();
  await expect(myPosts).toHaveCount(26);

  await page.context().clearCookies({ name: 'contest_session' });
  await page.goto('/');
  const publicPosts = page.getByRole('region', { name: '공개 그룹의 최신 사진' }).getByRole('article');
  await expect(publicPosts).toHaveCount(24);
  await publicPosts.nth(23).scrollIntoViewIfNeeded();
  await expect.poll(() => publicPosts.count()).toBeGreaterThan(24);
  expect(nextPages).toEqual([
    ['GalleryPosts', 24],
    ['GalleryPosts', 24],
    ['MyGalleryPosts', 24],
    ['PublicGalleryPosts', 24],
  ]);
});
