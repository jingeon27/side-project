import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup, joinGroup } from '../../test/support/fixtures';
import {
  createEntry,
  createGroupContest,
  SET_MODERATOR,
  TRANSFER_OWNER,
} from '../../test/support/group-contest';

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
  it('임명·해제·양도의 운영 기록은 성공한 상태 변경과 함께 저장해야 한다', async () => {
    const group = await createGroup(api, owner, '운영 기록', [deputy]);
    for (const enabled of [true, true, false])
      await api.gqlOk(owner.cookie, SET_MODERATOR, { id: group.id, user: deputy.id, enabled });
    await api.gqlOk(owner.cookie, TRANSFER_OWNER, { id: group.id, user: deputy.id });
    const events = await api.db.analyticsEvent.findMany({
      where: {
        type: { in: ['group_moderator_changed', 'group_ownership_transferred'] },
        properties: { path: ['groupId'], equals: group.id },
      },
    });
    expect(events).toHaveLength(3);
    expect(events.filter((event) => event.type === 'group_moderator_changed')).toHaveLength(2);
    expect(events.find((event) => event.type === 'group_ownership_transferred')?.properties).toMatchObject({
      previousOwnerId: owner.id,
      ownerId: deputy.id,
    });
    expect(JSON.stringify(events.map((event) => event.properties))).not.toContain(owner.nickname);
  });

  const REMOVE =
    'mutation($id:ID!,$user:ID!){removeGroupMember(groupId:$id,userId:$user){id role members{role user{id}}}}';
  const LEAVE = 'mutation($id:ID!){leaveGroup(groupId:$id){id role canViewPosts members{user{id}}}}';
  const isMember = async (groupId: string, userId: string) =>
    Boolean(await api.db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } }));

  it('그룹장은 부관리자·멤버를, 부관리자는 일반 멤버만 내보내고 그룹장은 아무도 내보낼 수 없어야 한다', async () => {
    const extra = await api.signIn('권한 운영-추방 대상');
    const group = await createGroup(api, owner, '멤버 추방', [deputy, member, extra], 'PRIVATE');
    await api.gqlOk(owner.cookie, SET_MODERATOR, { id: group.id, user: deputy.id, enabled: true });
    for (const actor of [undefined, member.cookie, outsider.cookie])
      expect((await api.gqlFail(actor, REMOVE, { id: group.id, user: extra.id })).code).toBe(
        actor ? 'FORBIDDEN' : 'UNAUTHENTICATED',
      );
    expect(await api.gqlFail(deputy.cookie, REMOVE, { id: group.id, user: owner.id })).toEqual({
      code: 'FORBIDDEN',
      message: '그룹장은 내보낼 수 없습니다.',
    });
    const peer = await api.signIn('권한 운영-다른 부관리자');
    await joinGroup(api, peer, group.inviteToken, owner);
    await api.gqlOk(owner.cookie, SET_MODERATOR, { id: group.id, user: peer.id, enabled: true });
    expect(await api.gqlFail(deputy.cookie, REMOVE, { id: group.id, user: peer.id })).toEqual({
      code: 'FORBIDDEN',
      message: '부관리자는 일반 멤버만 내보낼 수 있습니다.',
    });
    expect((await api.gqlFail(deputy.cookie, REMOVE, { id: group.id, user: deputy.id })).code).toBe(
      'BAD_USER_INPUT',
    );
    expect((await api.gqlFail(owner.cookie, REMOVE, { id: group.id, user: outsider.id })).code).toBe(
      'NOT_FOUND',
    );

    const removed = await api.gqlOk<{ removeGroupMember: { members: Array<{ user: { id: string } }> } }>(
      deputy.cookie,
      REMOVE,
      { id: group.id, user: extra.id },
    );
    expect(removed.removeGroupMember.members.map(({ user }) => user.id)).not.toContain(extra.id);
    await api.gqlOk(owner.cookie, REMOVE, { id: group.id, user: peer.id });
    expect(await isMember(group.id, extra.id)).toBe(false);
    expect(await isMember(group.id, peer.id)).toBe(false);
    // 비공개 그룹에서 내보낸 멤버는 게시물을 볼 수 없고, 같은 초대 링크로는 승인 대기만 된다.
    expect(
      (await api.gqlFail(extra.cookie, 'query($id:ID!){galleryPosts(groupId:$id){id}}', { id: group.id }))
        .code,
    ).toBe('FORBIDDEN');
    await api.gqlOk(extra.cookie, 'mutation($token:String!){joinGroup(token:$token){id}}', {
      token: group.inviteToken,
    });
    expect(await isMember(group.id, extra.id)).toBe(false);
    const events = await api.db.analyticsEvent.findMany({
      where: { type: 'group_member_removed', properties: { path: ['groupId'], equals: group.id } },
    });
    expect(events).toHaveLength(2);
  });

  it('본인은 그룹을 나갈 수 있고 그룹장은 양도한 뒤에만 나갈 수 있어야 한다', async () => {
    const group = await createGroup(api, owner, '그룹 나가기', [deputy, member]);
    expect(await api.gqlFail(owner.cookie, LEAVE, { id: group.id })).toEqual({
      code: 'BAD_USER_INPUT',
      message: '그룹장은 다른 멤버에게 관리자를 양도한 뒤 나갈 수 있습니다.',
    });
    expect((await api.gqlFail(outsider.cookie, LEAVE, { id: group.id })).code).toBe('FORBIDDEN');
    expect(
      await api.gqlOk<{ leaveGroup: { role: string | null; canViewPosts: boolean; members: unknown[] } }>(
        member.cookie,
        LEAVE,
        { id: group.id },
      ),
    ).toEqual({ leaveGroup: { id: group.id, role: null, canViewPosts: true, members: [] } });
    expect(await isMember(group.id, member.id)).toBe(false);
    // 공개 그룹은 다시 가입할 수 있고 가입 기록도 새로 남는다.
    await api.gqlOk(member.cookie, 'mutation($id:ID!){requestGroupMembership(groupId:$id){id}}', {
      id: group.id,
    });
    expect(await isMember(group.id, member.id)).toBe(true);
    const joins = await api.db.analyticsEvent.findMany({
      where: { type: 'group_joined', userId: member.id, properties: { path: ['groupId'], equals: group.id } },
    });
    expect(joins).toHaveLength(2);

    await api.gqlOk(owner.cookie, TRANSFER_OWNER, { id: group.id, user: deputy.id });
    await api.gqlOk(owner.cookie, LEAVE, { id: group.id });
    expect(await isMember(group.id, owner.id)).toBe(false);
  });
});
