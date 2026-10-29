import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';

const FIELDS =
  'id type groupId groupName postId postTitle commentId parentCommentId joinRequestId actorNickname readAt';
const LIST = `query { myNotifications { items { ${FIELDS} } unreadCount hasMore } notificationUnreadCount }`;
interface INotice {
  id: string;
  type: string;
  postId: string | null;
  commentId: string | null;
  readAt: string | null;
}
interface IPage {
  myNotifications: { items: INotice[]; unreadCount: number; hasMore: boolean };
  notificationUnreadCount: number;
}

describe('활동 알림', () => {
  let api: ITestApi;
  beforeAll(async () => {
    api = await createTestApp();
  });
  afterAll(async () => api?.close());
  const list = (user: ITestUser) => api.gqlOk<IPage>(user.cookie, LIST);
  const setup = async (name: string) => {
    const owner = await api.signIn(`알림${name}주인`);
    const member = await api.signIn(`알림${name}회원`);
    const peer = await api.signIn(`알림${name}상대`);
    const group = await createGroup(api, owner, `알림 ${name} 그룹`, [member, peer]);
    const createPost = async (author = owner) =>
      (
        await api.gqlOk<{ createPost: { id: string } }>(
          author.cookie,
          'mutation($id:ID!){createPost(groupId:$id,title:"알림 대상 게시물",linkUrl:"https://example.com",rightsConfirmed:true){id}}',
          { id: group.id },
        )
      ).createPost.id;
    return { owner, member, peer, group, createPost };
  };
  const comment = async (user: ITestUser, postId: string, parentId?: string) =>
    (
      await api.gqlOk<{ createPostComment: { id: string } }>(
        user.cookie,
        'mutation($postId:ID!,$parentId:ID){createPostComment(postId:$postId,parentId:$parentId,body:"알림 확인 댓글"){id}}',
        { postId, parentId },
      )
    ).createPostComment.id;

  it('내 글의 댓글과 내 댓글의 답글을 구분하고 본인 알림과 중복 수신을 막아야 한다', async () => {
    const { owner, member, peer, createPost } = await setup('수신');
    const postId = await createPost();
    await comment(owner, postId);
    expect((await list(owner)).notificationUnreadCount).toBe(0);
    const parentId = await comment(member, postId);
    expect((await list(owner)).myNotifications.items).toMatchObject([
      { type: 'POST_COMMENT', postId, commentId: parentId },
    ]);
    expect((await list(member)).myNotifications.items).toEqual([]);
    const replyId = await comment(peer, postId, parentId);
    expect((await list(member)).myNotifications.items).toMatchObject([
      { type: 'COMMENT_REPLY', commentId: replyId, parentCommentId: parentId },
    ]);
    expect((await list(owner)).myNotifications.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'POST_COMMENT', commentId: replyId })]),
    );
    const ownParent = await comment(owner, postId);
    const replyToOwner = await comment(member, postId, ownParent);
    expect(await api.db.notification.count({ where: { userId: owner.id, commentId: replyToOwner } })).toBe(1);
    expect((await list(peer)).myNotifications.items).toEqual([]);
  });

  it('조회·읽음 처리는 로그인한 본인에게만 허용하고 읽은 알림은 다시 처리해도 성공해야 한다', async () => {
    const { owner, member, createPost } = await setup('읽음');
    expect((await api.gqlFail(undefined, LIST)).code).toBe('UNAUTHENTICATED');
    await comment(member, await createPost());
    const [notice] = (await list(owner)).myNotifications.items;
    if (!notice) throw new Error('댓글 알림이 있어야 한다');
    const read = 'mutation($id:ID!){markNotificationRead(id:$id)}';
    expect((await api.gqlFail(member.cookie, read, { id: notice.id })).code).toBe('NOT_FOUND');
    expect((await list(owner)).notificationUnreadCount).toBe(1);
    await api.gqlOk(owner.cookie, read, { id: notice.id });
    await api.gqlOk(owner.cookie, read, { id: notice.id });
    expect((await list(owner)).myNotifications).toMatchObject({
      unreadCount: 0,
      items: [{ id: notice.id, readAt: expect.any(String) }],
    });
    await api.gqlOk(owner.cookie, 'mutation { markAllNotificationsRead }');
  });

  it('숨겨진 글과 탈퇴한 그룹의 댓글 알림을 목록·미읽음 숫자에서 제외해야 한다', async () => {
    const { owner, member, group, createPost } = await setup('권한');
    const postId = await createPost(member);
    await comment(owner, postId);
    expect((await list(member)).notificationUnreadCount).toBe(1);
    await api.db.post.update({ where: { id: postId }, data: { hidden: true } });
    expect((await list(member)).myNotifications.items).toEqual([]);
    expect((await list(member)).notificationUnreadCount).toBe(0);
    await api.db.post.update({ where: { id: postId }, data: { hidden: false } });
    await api.gqlOk(member.cookie, 'mutation($id:ID!){leaveGroup(groupId:$id){id}}', { id: group.id });
    expect((await list(member)).notificationUnreadCount).toBe(0);
  });

  it('비공개 그룹 가입 승인·거절 결과는 신청자에게만 한 번 기록해야 한다', async () => {
    const owner = await api.signIn('알림승인관리');
    const approved = await api.signIn('알림승인회원');
    const rejected = await api.signIn('알림거절회원');
    const group = await createGroup(api, owner, '알림 비공개 승인', [], 'PRIVATE');
    const request = async (user: ITestUser) => {
      await api.gqlOk(user.cookie, 'mutation($id:ID!){requestGroupMembership(groupId:$id){id}}', {
        id: group.id,
      });
      const row = await api.db.groupJoinRequest.findUniqueOrThrow({
        where: { groupId_userId: { groupId: group.id, userId: user.id } },
      });
      return row.id;
    };
    const first = await request(approved),
      second = await request(rejected);
    expect((await list(owner)).notificationUnreadCount).toBe(2);
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){approveGroupJoinRequest(requestId:$id)}', { id: first });
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){rejectGroupJoinRequest(requestId:$id)}', { id: second });
    expect((await list(approved)).myNotifications.items).toMatchObject([
      { type: 'JOIN_APPROVED', groupId: group.id },
    ]);
    expect((await list(rejected)).myNotifications.items).toMatchObject([
      { type: 'JOIN_REJECTED', groupId: group.id },
    ]);
    expect((await list(owner)).myNotifications.items).toEqual([]);
    expect(
      (
        await api.gqlFail(owner.cookie, 'mutation($id:ID!){approveGroupJoinRequest(requestId:$id)}', {
          id: first,
        })
      ).code,
    ).toBe('NOT_FOUND');
    expect(await api.db.notification.count({ where: { groupId: group.id } })).toBe(2);
  });

  it('새 가입 신청은 그룹장·부관리자에게 한 번 알리고 권한 해제와 처리 완료를 반영해야 한다', async () => {
    const owner = await api.signIn('신청알림그룹장');
    const moderator = await api.signIn('신청알림부관리자');
    const member = await api.signIn('신청알림일반회원');
    const applicant = await api.signIn('신청알림신청자');
    const group = await createGroup(api, owner, '신청 알림 관리자', [moderator, member], 'PRIVATE');
    for (const user of [moderator, member])
      await api.gqlOk(user.cookie, 'mutation { markAllNotificationsRead }');
    const setModerator =
      'mutation($groupId:ID!,$userId:ID!,$enabled:Boolean!){setGroupModerator(groupId:$groupId,userId:$userId,enabled:$enabled){id}}';
    await api.gqlOk(owner.cookie, setModerator, { groupId: group.id, userId: moderator.id, enabled: true });
    const request = 'mutation($id:ID!){requestGroupMembership(groupId:$id){id joinRequestPending}}';
    await Promise.all([
      api.gqlOk(applicant.cookie, request, { id: group.id }),
      api.gqlOk(applicant.cookie, request, { id: group.id }),
    ]);
    const pending = await api.db.groupJoinRequest.findUniqueOrThrow({
      where: { groupId_userId: { groupId: group.id, userId: applicant.id } },
    });
    for (const admin of [owner, moderator]) {
      const page = (await list(admin)).myNotifications;
      expect(page.unreadCount).toBe(1);
      expect(page.items.filter(({ type }) => type === 'JOIN_REQUESTED')).toMatchObject([
        { type: 'JOIN_REQUESTED', joinRequestId: pending.id, actorNickname: '신청알림신청자' },
      ]);
    }
    expect((await list(member)).myNotifications.items.some(({ type }) => type === 'JOIN_REQUESTED')).toBe(
      false,
    );
    expect((await list(applicant)).myNotifications.items).toEqual([]);
    await api.gqlOk(owner.cookie, setModerator, { groupId: group.id, userId: moderator.id, enabled: false });
    expect((await list(moderator)).notificationUnreadCount).toBe(0);
    expect((await list(moderator)).myNotifications.items.some(({ type }) => type === 'JOIN_REQUESTED')).toBe(
      false,
    );
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){approveGroupJoinRequest(requestId:$id)}', {
      id: pending.id,
    });
    expect((await list(owner)).myNotifications).toMatchObject({ items: [], unreadCount: 0 });
    expect(await api.db.notification.count({ where: { joinRequestId: pending.id } })).toBe(0);
    expect((await list(applicant)).myNotifications.items).toMatchObject([{ type: 'JOIN_APPROVED' }]);
  });
});
