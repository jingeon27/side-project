import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../support/app';
import { createGroup } from '../support/fixtures';
import { createEntry, createGroupContest, SET_MODERATOR, TRANSFER_OWNER } from '../support/group-contest';

describe('그룹장·부관리자 권한 통합', () => {
  let api: ITestApi, owner: ITestUser, deputy: ITestUser, member: ITestUser, outsider: ITestUser;
  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('권한 운영-그룹장');
    deputy = await api.signIn('권한 운영-부관리자');
    member = await api.signIn('권한 운영-회원');
    outsider = await api.signIn('권한 운영-외부인');
  });
  afterAll(async () => {
    await api.close();
  });

  it('그룹장만 가입 멤버를 부관리자로 임명·해제해야 한다', async () => {
    const group = await createGroup(api, owner, '부관리자 임명', [deputy, member]);
    for (const actor of [undefined, member.cookie, outsider.cookie]) {
      expect(
        (await api.gqlFail(actor, SET_MODERATOR, { id: group.id, user: deputy.id, enabled: true })).code,
      ).toBe(actor ? 'FORBIDDEN' : 'UNAUTHENTICATED');
    }
    await api.gqlOk(owner.cookie, SET_MODERATOR, { id: group.id, user: deputy.id, enabled: true });
    expect(
      (
        await api.db.groupMember.findUniqueOrThrow({
          where: { groupId_userId: { groupId: group.id, userId: deputy.id } },
        })
      ).role,
    ).toBe('MODERATOR');
    expect(
      (await api.gqlFail(deputy.cookie, SET_MODERATOR, { id: group.id, user: member.id, enabled: true }))
        .code,
    ).toBe('FORBIDDEN');
    expect(
      (await api.gqlFail(owner.cookie, SET_MODERATOR, { id: group.id, user: owner.id, enabled: false })).code,
    ).toBe('BAD_USER_INPUT');
    expect(
      (await api.gqlFail(owner.cookie, SET_MODERATOR, { id: group.id, user: outsider.id, enabled: true }))
        .code,
    ).toBe('FORBIDDEN');
    await api.gqlOk(owner.cookie, SET_MODERATOR, { id: group.id, user: deputy.id, enabled: false });
    expect(
      (
        await api.db.groupMember.findUniqueOrThrow({
          where: { groupId_userId: { groupId: group.id, userId: deputy.id } },
        })
      ).role,
    ).toBe('MEMBER');
  });

  it('부관리자는 대회·게시물·댓글·비공개 가입을 운영하되 그룹장 권한은 행사하지 못해야 한다', async () => {
    const group = await createGroup(api, owner, '부관리자 운영', [deputy, member], 'PRIVATE');
    await api.gqlOk(owner.cookie, SET_MODERATOR, { id: group.id, user: deputy.id, enabled: true });
    const contestId = await createGroupContest(api, deputy, group.id);
    expect(await api.db.contest.findUnique({ where: { id: contestId } })).toMatchObject({
      groupId: group.id,
      format: 'POST',
    });
    const post = await createEntry(api, member, group.id, null);
    const comment = await api.gqlOk<{ createPostComment: { id: string } }>(
      member.cookie,
      'mutation($id:ID!){createPostComment(postId:$id,body:"운영 댓글"){id}}',
      { id: post.id },
    );
    await api.gqlOk(deputy.cookie, 'mutation($id:ID!){deletePostComment(commentId:$id)}', {
      id: comment.createPostComment.id,
    });
    await api.gqlOk(outsider.cookie, 'mutation($id:ID!){requestGroupMembership(groupId:$id){id}}', {
      id: group.id,
    });
    const { groupJoinRequests } = await api.gqlOk<{ groupJoinRequests: Array<{ id: string }> }>(
      deputy.cookie,
      'query($id:ID!){groupJoinRequests(groupId:$id){id}}',
      { id: group.id },
    );
    expect(groupJoinRequests).toHaveLength(1);
    await api.gqlOk(deputy.cookie, 'mutation($id:ID!){approveGroupJoinRequest(requestId:$id)}', {
      id: groupJoinRequests[0]?.id,
    });
    await api.gqlOk(deputy.cookie, 'mutation($id:ID!){deletePost(postId:$id)}', { id: post.id });
    expect(await api.db.post.findUnique({ where: { id: post.id } })).toBeNull();
    expect((await api.gqlFail(deputy.cookie, TRANSFER_OWNER, { id: group.id, user: member.id })).code).toBe(
      'FORBIDDEN',
    );
    expect(
      (
        await api.gqlFail(deputy.cookie, 'mutation($id:ID!){regenerateInviteLink(groupId:$id){id}}', {
          id: group.id,
        })
      ).code,
    ).toBe('FORBIDDEN');
  });

  it('양도는 원래 그룹장을 일반 멤버로 바꾸고 새 그룹장에게만 임명 권한을 줘야 한다', async () => {
    const group = await createGroup(api, owner, '그룹장 양도', [deputy, member]);
    expect((await api.gqlFail(owner.cookie, TRANSFER_OWNER, { id: group.id, user: owner.id })).code).toBe(
      'BAD_USER_INPUT',
    );
    expect((await api.gqlFail(owner.cookie, TRANSFER_OWNER, { id: group.id, user: outsider.id })).code).toBe(
      'FORBIDDEN',
    );
    expect(
      (
        await api.db.groupMember.findUniqueOrThrow({
          where: { groupId_userId: { groupId: group.id, userId: owner.id } },
        })
      ).role,
    ).toBe('OWNER');
    const result = await api.gqlOk<{ transferGroupOwnership: { role: string } }>(
      owner.cookie,
      TRANSFER_OWNER,
      { id: group.id, user: deputy.id },
    );
    expect(result.transferGroupOwnership.role).toBe('MEMBER');
    expect(
      (await api.gqlFail(owner.cookie, SET_MODERATOR, { id: group.id, user: member.id, enabled: true })).code,
    ).toBe('FORBIDDEN');
    await api.gqlOk(deputy.cookie, SET_MODERATOR, { id: group.id, user: member.id, enabled: true });
  });

  it('서로 다른 멤버에게 동시에 양도해도 그룹장은 한 명만 남아야 한다', async () => {
    const group = await createGroup(api, owner, '동시 그룹장 양도', [deputy, member]);
    const results = await Promise.all(
      [deputy, member].map((user) => api.gql(owner.cookie, TRANSFER_OWNER, { id: group.id, user: user.id })),
    );
    expect(results.filter((result) => !result.errors)).toHaveLength(1);
    expect(await api.db.groupMember.count({ where: { groupId: group.id, role: 'OWNER' } })).toBe(1);
    expect(await api.db.groupMember.count({ where: { groupId: group.id } })).toBe(3);
  });
});
