import { createTestUser } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { productRequest, seedPost } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '댓글 알림 개수와 읽음을 반영하고 관련 게시물의 댓글을 열어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const owner = await signIn('알림 확인 회원');
    const group = await seedGroup(owner, '알림으로 만나는 순간');
    const peer = await createTestUser(API_URL, { nickname: '알림을 보낸 친구', origin: WEB_ORIGIN });
    await productRequest(peer, 'mutation($token:String!){joinGroup(token:$token){id}}', {
      token: group.inviteToken,
    });
    const postId = await seedPost(owner, group.id, '댓글 알림을 확인할 사진');
    await productRequest(
      peer,
      'mutation($id:ID!){createPostComment(postId:$id,body:"알림을 눌러 이 댓글을 확인해 주세요"){id}}',
      { id: postId },
    );
    await page.goto('/');
    await page.getByRole('link', { name: '알림 1개', exact: true }).click();
    const list = page.getByRole('list', { name: '활동 알림', exact: true });
    await expect(list.getByText('내 게시물에 댓글이 달렸어요')).toBeVisible();
    await list.getByRole('button').click();
    const dialog = page.getByRole('dialog', { name: '댓글', exact: true });
    await expect(dialog.getByText('알림을 눌러 이 댓글을 확인해 주세요')).toBeVisible();
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(page.getByText('읽지 않은 알림 0개')).toBeVisible();
    await page.reload();
    await expect(page.getByText('읽지 않은 알림 0개')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  },
);

test(
  '가입 신청 알림에서 검토하고 처리 후 대기 알림을 정리해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const owner = await signIn('알림 승인 그룹장');
    const group = await seedGroup(owner, '함께할 친구를 기다려요', 'PRIVATE');
    const applicant = await createTestUser(API_URL, { nickname: '새로 온 친구', origin: WEB_ORIGIN });
    await productRequest(applicant, 'mutation($id:ID!){requestGroupMembership(groupId:$id){id}}', {
      id: group.id,
    });
    await page.goto('/notifications');
    await page.getByRole('button', { name: /새 그룹 가입 신청이 있어요/ }).click();
    await expect(page).toHaveURL(`/groups/${group.id}#join-requests`);
    await page.getByRole('button', { name: '새로 온 친구 가입 수락', exact: true }).click();
    await expect(page.getByText('대기 중인 가입 신청이 없어요.')).toBeVisible();
    await page.goto('/notifications');
    await expect(page.getByText('아직 새 알림이 없어요')).toBeVisible();
    const result = await productRequest<{ myNotifications: { items: { type: string }[] } }>(
      applicant,
      'query {myNotifications {items {id type}}}',
    );
    expect(result.myNotifications.items).toMatchObject([{ type: 'JOIN_APPROVED' }]);
  },
);
