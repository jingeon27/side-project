import { mkdir } from 'node:fs/promises';

import { createTestUser } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { productRequest, seedPost } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '댓글 아래 답글을 작성·펼침·좋아요·취소·삭제하고 다시 열어도 유지되어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    const owner = await signIn('대화 관리자');
    const member = await createTestUser(API_URL, { nickname: '웃음 수집가', origin: WEB_ORIGIN });
    const group = await seedGroup(owner, '오늘의 웃음');
    await productRequest(member, 'mutation($token:String!){joinGroup(token:$token){id}}', {
      token: group.inviteToken,
    });
    const postId = await seedPost(member, group.id, '우연히 찍힌 완벽한 순간');
    const { createPostComment: parent } = await productRequest<{ createPostComment: { id: string } }>(
      member,
      'mutation($id:ID!){createPostComment(postId:$id,body:"이 타이밍은 다시 못 찍겠는데요!"){id}}',
      { id: postId },
    );
    await page.goto(`/groups/${group.id}`);
    const latest = page.getByRole('region', { name: '최신 게시물', exact: true });
    await latest.getByRole('button', { name: '우연히 찍힌 완벽한 순간 댓글 1개' }).click();
    const sheet = page.getByRole('dialog', { name: '댓글', exact: true });
    await sheet.getByRole('button', { name: '답글 달기', exact: true }).click();
    await sheet.getByRole('textbox', { name: '답글', exact: true }).fill('덕분에 오늘도 한 번 웃고 가요.');
    await sheet.getByRole('button', { name: '답글 올리기', exact: true }).click();
    const replies = sheet.getByRole('list', { name: '답글', exact: true });
    await expect(replies.getByText('덕분에 오늘도 한 번 웃고 가요.')).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: '답글', exact: true })).toHaveCount(0);
    await replies.getByRole('button', { name: '댓글 좋아요 0개', exact: true }).click();
    await expect(replies.getByRole('button', { name: '댓글 좋아요 1개', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(replies.getByRole('button', { name: '댓글 좋아요 1개', exact: true })).toBeEnabled();
    await sheet.getByRole('button', { name: '닫기', exact: true }).click();
    await latest.getByRole('button', { name: '우연히 찍힌 완벽한 순간 댓글 2개' }).click();
    await sheet.getByRole('button', { name: '답글 1개 보기', exact: true }).click();
    await expect(replies.getByRole('button', { name: '댓글 좋아요 1개', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await replies.getByRole('button', { name: '댓글 좋아요 1개', exact: true }).click();
    await expect(replies.getByRole('button', { name: '댓글 좋아요 0개', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({
      animations: 'disabled',
      path: `.data/screens/${testInfo.project.name}-comment-replies.png`,
    });
    expect(await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await replies.getByRole('button', { name: '대화 관리자 댓글 삭제', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '댓글 삭제하기' }).click();
    await expect(replies).toHaveCount(0);
    await expect(sheet.getByText('이 타이밍은 다시 못 찍겠는데요!')).toBeVisible();
    await sheet.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(latest.getByRole('button', { name: '우연히 찍힌 완벽한 순간 댓글 1개' })).toBeVisible();
    expect(
      (
        await productRequest<{ postComments: { id: string }[] }>(
          owner,
          'query($postId:ID!,$parentId:ID){postComments(postId:$postId,parentId:$parentId){id}}',
          { postId, parentId: parent.id },
        )
      ).postComments,
    ).toHaveLength(0);
  },
);

test('답글의 추가 페이지와 원댓글 개수를 별도로 관리해야 한다', async ({ page, signIn }) => {
  const owner = await signIn('답글 페이지 회원');
  const group = await seedGroup(owner, '답글 페이지 그룹');
  const postId = await seedPost(owner, group.id, '답글 이어 보기');
  const { createPostComment: parent } = await productRequest<{ createPostComment: { id: string } }>(
    owner,
    'mutation($id:ID!){createPostComment(postId:$id,body:"원댓글 하나"){id}}',
    { id: postId },
  );
  for (let index = 0; index < 13; index++)
    await productRequest(
      owner,
      'mutation($postId:ID!,$parentId:ID,$body:String!){createPostComment(postId:$postId,parentId:$parentId,body:$body){id}}',
      { postId, parentId: parent.id, body: `차례대로 ${index}` },
    );
  await page.goto(`/groups/${group.id}`);
  await page
    .getByRole('region', { name: '최신 게시물', exact: true })
    .getByRole('button', { name: '답글 이어 보기 댓글 14개' })
    .click();
  const sheet = page.getByRole('dialog', { name: '댓글', exact: true });
  await sheet.getByRole('button', { name: '답글 13개 보기', exact: true }).click();
  const replies = sheet.getByRole('list', { name: '답글', exact: true });
  await expect(replies.getByRole('listitem')).toHaveCount(12);
  await sheet.getByRole('button', { name: '답글 더 보기', exact: true }).click();
  await expect(replies.getByRole('listitem')).toHaveCount(13);
  await expect(replies.getByRole('listitem').first()).toContainText('차례대로 0');
  await expect(sheet.getByRole('button', { name: '댓글 더 보기', exact: true })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: '답글 더 보기', exact: true })).toHaveCount(0);
});
