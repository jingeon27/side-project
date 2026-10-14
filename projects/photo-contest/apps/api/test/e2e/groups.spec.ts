import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ContestService } from '../../src/contest/contest.service';
import { GroupService } from '../../src/group/group.service';
import { createTestApp } from '../support/app';
import type { ITestApi, ITestUser } from '../support/app';
import { createContest, createGroup, joinGroup } from '../support/fixtures';

const GROUP_FORBIDDEN = { code: 'FORBIDDEN', message: '이 그룹에 접근할 권한이 없습니다.' };
const INVALID_INVITE = { code: 'NOT_FOUND', message: '유효하지 않은 초대 링크입니다.' };

const JOIN_GROUP = 'mutation($token: String!) { joinGroup(token: $token) { id role } }';
const INVITE_PREVIEW = `
  query($token: String!) {
    invitePreview(token: $token) { groupName memberCount ownerNickname joinedGroupId }
  }
`;
const REGENERATE =
  'mutation($groupId: ID!) { regenerateInviteLink(groupId: $groupId) { id role inviteToken } }';

interface IMemberView {
  user: { id: string; nickname: string };
  role: string;
}

describe('그룹과 초대', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let friend: ITestUser;
  let voter: ITestUser;
  let outsider: ITestUser;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('그룹-관리자');
    friend = await api.signIn('그룹-친구');
    voter = await api.signIn('그룹-투표자');
    outsider = await api.signIn('그룹-외부인');
  });

  afterAll(async () => {
    await api?.close();
  });

  function membersOf(cookie: string, groupId: string) {
    return api
      .gqlOk<{ group: { members: IMemberView[] } }>(
        cookie,
        'query($id: ID!) { group(id: $id) { members { user { id nickname } role } } }',
        { id: groupId },
      )
      .then(({ group }) => group.members);
  }

  it('그룹을 만들고 초대로 가입해야 한다', async () => {
    const { createGroup: group } = await api.gqlOk<{
      createGroup: { id: string; name: string; role: string; inviteToken: string; members: IMemberView[] };
    }>(
      owner.cookie,
      'mutation { createGroup(name: "웃음 연구소") { id name role inviteToken members { user { id nickname } role } } }',
    );
    expect(group).toMatchObject({ name: '웃음 연구소', role: 'OWNER' });
    expect(group.inviteToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(group.members).toEqual([{ user: { id: owner.id, nickname: owner.nickname }, role: 'OWNER' }]);

    for (const member of [friend, voter]) {
      const joined = await api.gqlOk<{ joinGroup: { id: string; role: string } }>(member.cookie, JOIN_GROUP, {
        token: group.inviteToken,
      });
      expect(joined.joinGroup).toEqual({ id: group.id, role: 'MEMBER' });
    }
    expect(await membersOf(voter.cookie, group.id)).toEqual([
      { user: { id: owner.id, nickname: owner.nickname }, role: 'OWNER' },
      { user: { id: friend.id, nickname: friend.nickname }, role: 'MEMBER' },
      { user: { id: voter.id, nickname: voter.nickname }, role: 'MEMBER' },
    ]);
  });

  it('그룹 이름은 앞뒤 공백을 지우고 1~40자여야 한다', async () => {
    const created = await api.gqlOk<{ createGroup: { name: string } }>(
      owner.cookie,
      'mutation($name: String!) { createGroup(name: $name) { name } }',
      { name: '  공백 그룹  ' },
    );
    expect(created.createGroup.name).toBe('공백 그룹');
    for (const name of ['', '   ', '가'.repeat(41)])
      expect(
        await api.gqlFail(owner.cookie, 'mutation($name: String!) { createGroup(name: $name) { id } }', {
          name,
        }),
      ).toEqual({ code: 'BAD_USER_INPUT', message: '그룹 이름은(는) 1~40자여야 합니다.' });
  });

  it('비회원은 그룹 ID를 알아도 그룹에 접근할 수 없어야 한다', async () => {
    const group = await createGroup(api, owner, '비공개 그룹', [friend]);
    const query = 'query($id: ID!) { group(id: $id) { name } }';
    expect(await api.gqlFail(outsider.cookie, query, { id: group.id })).toEqual(GROUP_FORBIDDEN);
    // 없는 그룹도 같은 오류로 답해 그룹이 있는지 드러내지 않는다.
    expect(await api.gqlFail(outsider.cookie, query, { id: 'missing-group' })).toEqual(GROUP_FORBIDDEN);
    expect(await api.gqlFail(outsider.cookie, REGENERATE, { groupId: group.id })).toEqual(GROUP_FORBIDDEN);
    const { myGroups } = await api.gqlOk<{ myGroups: Array<{ id: string }> }>(
      outsider.cookie,
      '{ myGroups { id } }',
    );
    expect(myGroups.map(({ id }) => id)).not.toContain(group.id);
  });

  it('이미 가입한 멤버가 다시 가입해도 한 번만 남고 역할이 바뀌지 않아야 한다', async () => {
    const group = await createGroup(api, owner, '재가입 그룹', [friend]);
    expect(await api.gqlOk(owner.cookie, JOIN_GROUP, { token: group.inviteToken })).toEqual({
      joinGroup: { id: group.id, role: 'OWNER' },
    });
    expect(await api.gqlOk(friend.cookie, JOIN_GROUP, { token: group.inviteToken })).toEqual({
      joinGroup: { id: group.id, role: 'MEMBER' },
    });
    expect(await api.db.groupMember.count({ where: { groupId: group.id } })).toBe(2);
  });

  it('같은 초대로 동시에 가입해도 멤버십은 하나만 남아야 한다', async () => {
    const group = await createGroup(api, owner, '동시 가입 그룹');
    const joiner = await api.signIn('그룹-동시가입');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api.gql(joiner.cookie, JOIN_GROUP, { token: group.inviteToken })),
    );
    expect(results.some((result) => !result.errors)).toBe(true);
    // 겹친 트랜잭션이 재시도를 모두 써도 결과는 CONFLICT일 뿐 중복 가입이 생기지 않는다.
    for (const result of results.filter((item) => item.errors))
      expect(result.errors?.[0]?.extensions?.code).toBe('CONFLICT');
    expect(await api.db.groupMember.count({ where: { groupId: group.id, userId: joiner.id } })).toBe(1);
  });

  it('myGroups는 조회한 사용자의 역할과 함께 최근에 가입한 그룹부터 돌려줘야 한다', async () => {
    const member = await api.signIn('그룹-목록');
    const joined = await createGroup(api, owner, '먼저 가입한 그룹', [member]);
    const { createGroup: own } = await api.gqlOk<{ createGroup: { id: string } }>(
      member.cookie,
      'mutation { createGroup(name: "직접 만든 그룹") { id } }',
    );
    expect(await api.gqlOk(member.cookie, '{ myGroups { id name role members { user { id } } } }')).toEqual({
      myGroups: [
        { id: own.id, name: '직접 만든 그룹', role: 'OWNER', members: [{ user: { id: member.id } }] },
        {
          id: joined.id,
          name: '먼저 가입한 그룹',
          role: 'MEMBER',
          members: [{ user: { id: owner.id } }, { user: { id: member.id } }],
        },
      ],
    });
  });

  it('멤버·대회·순위는 요청한 필드만 계산하고 목록의 멤버와 조회자 값은 한 번에 불러와야 한다', async () => {
    const member = await api.signIn('그룹-필드');
    const first = await createGroup(api, owner, '필드 그룹 하나', [member]);
    const second = await createGroup(api, owner, '필드 그룹 둘', [member]);
    await createContest(api, owner, first.id, '필드 대회 하나');
    await createContest(api, owner, first.id, '필드 대회 둘');
    const groups = api.app.get(GroupService);
    const contests = api.app.get(ContestService);
    // 그룹·대회 목록에서 형제 노드를 한 번에 불러오는지는 내부 조회 함수 호출 수로 본다.
    const internals = {
      membersOf: vi.spyOn(groups as unknown as { membersOf: () => Promise<unknown> }, 'membersOf'),
      viewerStats: vi.spyOn(contests as unknown as { viewerStats: () => Promise<unknown> }, 'viewerStats'),
      leaderboard: vi.spyOn(groups, 'leaderboard'),
      contestsOfGroup: vi.spyOn(contests, 'contestsOfGroup'),
    };
    try {
      await api.gqlOk(member.cookie, '{ myGroups { id name role inviteToken } }');
      for (const [name, spy] of Object.entries(internals)) expect(spy, name).not.toHaveBeenCalled();

      const { myGroups } = await api.gqlOk<{ myGroups: Array<{ id: string }> }>(
        member.cookie,
        '{ myGroups { id members { role } contests { id } leaderboard { rank } } }',
      );
      expect(myGroups.map(({ id }) => id)).toEqual([second.id, first.id]);
      expect(internals.membersOf).toHaveBeenCalledTimes(1);
      expect(internals.membersOf).toHaveBeenCalledWith([second.id, first.id]);
      expect(internals.contestsOfGroup).toHaveBeenCalledTimes(2);
      expect(internals.leaderboard).toHaveBeenCalledTimes(2);

      await api.gqlOk(
        member.cookie,
        'query($id: ID!) { group(id: $id) { contests { mySubmissionId votedSubmissionId submissionCount } } }',
        { id: first.id },
      );
      expect(internals.viewerStats).toHaveBeenCalledTimes(1);
    } finally {
      for (const spy of Object.values(internals)) spy.mockRestore();
    }
  });

  describe('초대 링크', () => {
    it('모든 멤버가 같은 초대 토큰을 볼 수 있어야 한다', async () => {
      const group = await createGroup(api, owner, '토큰 공유 그룹', [friend]);
      const query = 'query($id: ID!) { group(id: $id) { role inviteToken } }';
      expect(await api.gqlOk(friend.cookie, query, { id: group.id })).toEqual({
        group: { role: 'MEMBER', inviteToken: group.inviteToken },
      });
    });

    it('초대 미리보기는 로그인 없이 그룹 이름·인원·관리자 닉네임을 보여줘야 한다', async () => {
      const group = await createGroup(api, owner, '미리보기 그룹', [friend, voter]);
      expect(await api.gqlOk(undefined, INVITE_PREVIEW, { token: group.inviteToken })).toEqual({
        invitePreview: {
          groupName: '미리보기 그룹',
          memberCount: 3,
          ownerNickname: owner.nickname,
          joinedGroupId: null,
        },
      });
      const asMember = await api.gqlOk<{ invitePreview: { joinedGroupId: string | null } }>(
        friend.cookie,
        INVITE_PREVIEW,
        { token: group.inviteToken },
      );
      expect(asMember.invitePreview.joinedGroupId).toBe(group.id);
      const asOutsider = await api.gqlOk<{ invitePreview: { joinedGroupId: string | null } }>(
        outsider.cookie,
        INVITE_PREVIEW,
        { token: group.inviteToken },
      );
      expect(asOutsider.invitePreview.joinedGroupId).toBeNull();
    });

    it('관리자가 여럿이면 가장 먼저 가입한 관리자의 닉네임을 보여줘야 한다', async () => {
      const group = await createGroup(api, owner, '공동 관리 그룹', [friend]);
      // 관리자를 더 만드는 화면은 없으므로 DB에서 역할을 바꾼다.
      await api.db.groupMember.update({
        where: { groupId_userId: { groupId: group.id, userId: friend.id } },
        data: { role: 'OWNER' },
      });
      const { invitePreview } = await api.gqlOk<{ invitePreview: { ownerNickname: string } }>(
        undefined,
        INVITE_PREVIEW,
        { token: group.inviteToken },
      );
      expect(invitePreview.ownerNickname).toBe(owner.nickname);
    });

    it('초대 토큰이 비었거나 100자를 넘으면 BAD_USER_INPUT이어야 한다', async () => {
      const invalid = { code: 'BAD_USER_INPUT', message: '초대 코드은(는) 1~100자여야 합니다.' };
      for (const token of ['', ' ', 'a'.repeat(101)]) {
        expect(await api.gqlFail(friend.cookie, JOIN_GROUP, { token })).toEqual(invalid);
        expect(await api.gqlFail(undefined, INVITE_PREVIEW, { token })).toEqual(invalid);
      }
    });

    it('관리자만 초대 링크를 다시 만들 수 있고 이전 링크는 더 이상 쓸 수 없어야 한다', async () => {
      const group = await createGroup(api, owner, '링크 교체 그룹', [friend]);
      expect(await api.gqlFail(friend.cookie, REGENERATE, { groupId: group.id })).toEqual(GROUP_FORBIDDEN);

      const { regenerateInviteLink: regenerated } = await api.gqlOk<{
        regenerateInviteLink: { id: string; role: string; inviteToken: string };
      }>(owner.cookie, REGENERATE, { groupId: group.id });
      expect(regenerated).toMatchObject({ id: group.id, role: 'OWNER' });
      expect(regenerated.inviteToken).not.toBe(group.inviteToken);
      expect(await api.db.group.findUniqueOrThrow({ where: { id: group.id } })).toMatchObject({
        inviteToken: regenerated.inviteToken,
        inviteHash: createHash('sha256').update(regenerated.inviteToken).digest('hex'),
      });

      expect(await api.gqlFail(outsider.cookie, JOIN_GROUP, { token: group.inviteToken })).toEqual(
        INVALID_INVITE,
      );
      expect(await api.gqlFail(undefined, INVITE_PREVIEW, { token: group.inviteToken })).toEqual(
        INVALID_INVITE,
      );

      expect(
        await api.gqlOk(friend.cookie, 'query($id: ID!) { group(id: $id) { inviteToken } }', {
          id: group.id,
        }),
      ).toEqual({ group: { inviteToken: regenerated.inviteToken } });
      await joinGroup(api, outsider, regenerated.inviteToken);
      expect(await api.db.groupMember.count({ where: { groupId: group.id } })).toBe(3);
    });
  });
});
