import { mkdir } from 'node:fs/promises';
import { createTestUser } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { productRequest, seedPost } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '댓글을 작성하고 작성자·관리자가 삭제하면 피드의 개수도 바뀌어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const owner = await signIn('댓글 관리자');
    const member = await createTestUser(API_URL, { nickname: '댓글 친구', origin: WEB_ORIGIN });
    const group = await seedGroup(owner, '댓글 그룹');
    await productRequest(member, 'mutation($token:String!){joinGroup(token:$token){id}}', {
      token: group.inviteToken,
    });
    const postId = await seedPost(member, group.id, '댓글이 있는 순간');
    await productRequest(
      member,
      'mutation($id:ID!){createPostComment(postId:$id,body:"친구가 남긴 웃음"){id}}',
      { id: postId },
    );
    await page.goto(`/groups/${group.id}`);
    const post = page
      .getByRole('region', { name: '최신 게시물' })
      .getByRole('article', { name: '댓글이 있는 순간' });
    await post.getByRole('button', { name: '댓글이 있는 순간 댓글 1개' }).click();
    const sheet = page.getByRole('dialog', { name: '댓글', exact: true });
    const list = sheet.getByRole('list', { name: '게시물 댓글' });
    await expect(list.getByText('친구가 남긴 웃음')).toBeVisible();
    await sheet.getByRole('button', { name: '댓글 올리기' }).click();
    await expect(sheet.getByText('댓글을 입력해 주세요.')).toBeVisible();
    const input = sheet.getByRole('textbox', { name: '댓글', exact: true });
    await expect(input).toBeFocused();
    await input.fill('한참 웃었어요\n이 순간은 저장!');
    await sheet.getByRole('button', { name: '댓글 올리기' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list.getByRole('listitem').first()).toContainText('이 순간은 저장!');
    await expect(input).toHaveValue('');
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({ path: `.data/screens/${testInfo.project.name}-comments.png` });
    for (const nickname of ['댓글 관리자', '댓글 친구']) {
      await list.getByRole('button', { name: `${nickname} 댓글 삭제` }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: '댓글 삭제하기' }).click();
      await expect(list.getByRole('button', { name: `${nickname} 댓글 삭제` })).toHaveCount(0);
    }
    await expect(sheet.getByText('첫 댓글을 남겨보세요.')).toBeVisible();
    await sheet.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(post.getByRole('button', { name: '댓글이 있는 순간 댓글 0개' })).toBeVisible();
    await page.reload();
    await expect(post.getByRole('button', { name: '댓글이 있는 순간 댓글 0개' })).toBeVisible();
  },
);

test('댓글의 다음 페이지와 새 댓글 작성 뒤 목록을 정확히 이어 받아야 한다', async ({ page, signIn }) => {
  const cookie = await signIn('댓글 페이지 회원');
  const group = await seedGroup(cookie, '댓글 페이지 그룹');
  const postId = await seedPost(cookie, group.id, '댓글 많은 순간');
  for (let index = 0; index < 25; index++)
    await productRequest(
      cookie,
      'mutation($id:ID!,$body:String!){createPostComment(postId:$id,body:$body){id}}',
      { id: postId, body: `이야기 ${index}` },
    );
  await page.goto(`/groups/${group.id}`);
  await page.getByRole('button', { name: '댓글 많은 순간 댓글 25개' }).click();
  const sheet = page.getByRole('dialog', { name: '댓글', exact: true });
  const items = sheet.getByRole('list', { name: '게시물 댓글' }).getByRole('listitem');
  await expect(items).toHaveCount(24);
  await sheet.getByRole('button', { name: '댓글 더 보기' }).click();
  await expect(items).toHaveCount(25);
  await expect(sheet.getByRole('button', { name: '댓글 더 보기' })).toHaveCount(0);
  await sheet.getByRole('textbox', { name: '댓글', exact: true }).fill('새로운 이야기');
  await sheet.getByRole('button', { name: '댓글 올리기' }).click();
  await expect(items).toHaveCount(24);
  await expect(items.first()).toContainText('새로운 이야기');
  await sheet.getByRole('button', { name: '댓글 더 보기' }).click();
  await expect(items).toHaveCount(26);
  await expect(sheet.getByRole('button', { name: '댓글 더 보기' })).toHaveCount(0);
});
