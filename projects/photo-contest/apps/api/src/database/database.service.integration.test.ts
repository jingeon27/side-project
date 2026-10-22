import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestImage } from '@photo-contest/test-kit';

import { createTestApp, uploadToStorage, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import {
  CAST_POST_VOTE,
  createEntry,
  createGroupContest,
  moveGroupContest,
  SET_MODERATOR,
} from '../../test/support/group-contest';

const REQUEST_AVATAR =
  'mutation($groupId:ID!,$size:Int!){requestGroupAvatarUpload(groupId:$groupId,contentType:"image/png",byteSize:$size){id url fields{name value}}}';
const COMPLETE_AVATAR = 'mutation($id:ID!){completeGroupAvatarUpload(uploadId:$id){id}}';
const SET_AVATAR =
  'mutation($groupId:ID!,$avatarId:ID){updateGroupProfile(groupId:$groupId,name:"삭제 순서 그룹",description:"",avatarId:$avatarId){avatarUrl}}';

/** schema.prisma의 FK 동작이 운영자가 행을 직접 지울 때 순서 때문에 실패하지 않는지 실제 PostgreSQL에서 본다. */
describe('수동 삭제의 FK 순서 회귀', () => {
  let api: ITestApi;
  let owner: ITestUser;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('삭제순서-그룹장');
  });

  afterAll(async () => {
    await api?.close();
  });

  async function setAvatar(uploader: ITestUser, groupId: string) {
    const body = await createTestImage();
    const { requestGroupAvatarUpload: ticket } = await api.gqlOk<{
      requestGroupAvatarUpload: { id: string; url: string; fields: Array<{ name: string; value: string }> };
    }>(uploader.cookie, REQUEST_AVATAR, { groupId, size: body.length });
    expect((await uploadToStorage(ticket, body, 'image/png')).status).toBe(204);
    await api.gqlOk(uploader.cookie, COMPLETE_AVATAR, { id: ticket.id });
    const { updateGroupProfile } = await api.gqlOk<{ updateGroupProfile: { avatarUrl: string } }>(
      uploader.cookie,
      SET_AVATAR,
      { groupId, avatarId: ticket.id },
    );
    return { avatarId: ticket.id, avatarUrl: updateGroupProfile.avatarUrl };
  }

  it('대표 사진을 올린 사용자를 지워도 실패하지 않고 그룹 대표 사진은 남아야 한다', async () => {
    // 사용자 삭제가 PostUpload를 cascade로 지우는데 GroupAvatar의 RESTRICT FK가 막아 삭제 전체가 실패했다.
    const deputy = await api.signIn('삭제순서-부관리자');
    const group = await createGroup(api, owner, '삭제 순서 그룹', [deputy]);
    await api.gqlOk(owner.cookie, SET_MODERATOR, { id: group.id, user: deputy.id, enabled: true });
    const { avatarId, avatarUrl } = await setAvatar(deputy, group.id);
    await createEntry(api, deputy, group.id, null);

    await api.db.user.delete({ where: { id: deputy.id } });

    expect(await api.db.groupAvatar.findUniqueOrThrow({ where: { id: avatarId } })).toMatchObject({
      mediaUploadId: null,
    });
    expect(await api.db.post.count({ where: { authorId: deputy.id } })).toBe(0);
    expect(await api.db.postUpload.count({ where: { userId: deputy.id } })).toBe(0);
    expect((await api.http().get(avatarUrl.replace('/backend', ''))).status).toBe(307);
  });

  it('게시물·분류·대표 사진·대회 투표가 있는 그룹을 한 번에 지울 수 있어야 한다', async () => {
    const member = await api.signIn('삭제순서-회원');
    const voter = await api.signIn('삭제순서-투표자');
    const group = await createGroup(api, owner, '삭제 순서 그룹 전체', [member, voter], 'PRIVATE');
    await setAvatar(owner, group.id);
    const { createGroupCategory: category } = await api.gqlOk<{ createGroupCategory: { id: string } }>(
      owner.cookie,
      'mutation($groupId:ID!){createGroupCategory(groupId:$groupId,name:"삭제 분류"){id}}',
      { groupId: group.id },
    );
    const contestId = await createGroupContest(api, owner, group.id, '삭제 순서 대회');
    const entry = await createEntry(api, member, group.id, contestId);
    await api.gqlOk(
      member.cookie,
      'mutation($id:ID!,$category:ID){setPostCategory(postId:$id,categoryId:$category){id}}',
      {
        id: entry.id,
        category: category.id,
      },
    );
    await api.gqlOk(voter.cookie, 'mutation($id:ID!){createPostComment(postId:$id,body:"댓글"){id}}', {
      id: entry.id,
    });
    await moveGroupContest(api, contestId, 'VOTING');
    await api.gqlOk(voter.cookie, CAST_POST_VOTE, { id: contestId, postId: entry.id });

    await api.db.group.delete({ where: { id: group.id } });

    expect(await api.db.post.count({ where: { groupId: group.id } })).toBe(0);
    expect(await api.db.postUpload.count({ where: { groupId: group.id } })).toBe(0);
    expect(await api.db.groupAvatar.count({ where: { groupId: group.id } })).toBe(0);
    expect(await api.db.postContestVote.count({ where: { contestId } })).toBe(0);
  });

  it('투표가 있는 그룹 대회를 지우면 참여작은 일반 게시물로 남아야 한다', async () => {
    const member = await api.signIn('삭제순서-대회 회원');
    const voter = await api.signIn('삭제순서-대회 투표자');
    const group = await createGroup(api, owner, '삭제 순서 대회 그룹', [member, voter]);
    const contestId = await createGroupContest(api, owner, group.id, '지울 대회');
    const entry = await createEntry(api, member, group.id, contestId);
    await moveGroupContest(api, contestId, 'VOTING');
    await api.gqlOk(voter.cookie, CAST_POST_VOTE, { id: contestId, postId: entry.id });

    await api.db.contest.delete({ where: { id: contestId } });

    expect(await api.db.post.findUniqueOrThrow({ where: { id: entry.id } })).toMatchObject({
      contestId: null,
    });
    expect(await api.db.postContestVote.count({ where: { contestId } })).toBe(0);
  });
});
