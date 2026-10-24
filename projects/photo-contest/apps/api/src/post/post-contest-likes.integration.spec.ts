import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { contestSchedule, createGroup } from '../../test/support/fixtures';
import { CAST_POST_VOTE, createEntry, moveGroupContest } from '../../test/support/group-contest';
import * as monitoring from '../monitoring/sentry';

const CREATE =
  'mutation($groupId:ID!,$startsAt:DateTime!,$submissionEndsAt:DateTime!,$endsAt:DateTime!,$likeLimit:Int){createGroupContest(groupId:$groupId,title:"좋아요 한도 대회",startsAt:$startsAt,submissionEndsAt:$submissionEndsAt,endsAt:$endsAt,likeLimit:$likeLimit){id likeLimit}}';
const LIKE = 'mutation($id:ID!){likePost(postId:$id){id likedByMe likeCount contest{likeLimit}}}';
const UNLIKE = 'mutation($id:ID!){unlikePost(postId:$id){id likedByMe likeCount}}';

describe('대회별 1인당 게시물 좋아요 한도', () => {
  let api: ITestApi, owner: ITestUser, member: ITestUser, groupId: string;
  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('좋아요 한도 관리자');
    member = await api.signIn('좋아요 한도 회원');
    groupId = (await createGroup(api, owner, '한도 그룹', [member])).id;
  });
  afterAll(async () => {
    await api?.close();
  });
  const contest = async (likeLimit?: number | null) =>
    (
      await api.gqlOk<{ createGroupContest: { id: string; likeLimit: number } }>(owner.cookie, CREATE, {
        groupId,
        ...contestSchedule(),
        ...(likeLimit !== undefined ? { likeLimit } : {}),
      })
    ).createGroupContest;

  it('생략·null 모두 기본값 1이며 관리자만 1~100 범위에서 설정해야 한다', async () => {
    expect((await contest()).likeLimit).toBe(1);
    expect((await contest(null)).likeLimit).toBe(1);
    expect((await contest(3)).likeLimit).toBe(3);
    for (const likeLimit of [0, -1, 101])
      expect(
        (await api.gqlFail(owner.cookie, CREATE, { groupId, ...contestSchedule(), likeLimit })).code,
      ).toBe('BAD_USER_INPUT');
    expect(
      (await api.gqlFail(member.cookie, CREATE, { groupId, ...contestSchedule(), likeLimit: 2 })).code,
    ).toBe('FORBIDDEN');
  });

  it('한도에 도달해도 같은 작품의 재요청은 성공하고 취소 후 다른 작품을 선택해야 한다', async () => {
    const event = await contest();
    const first = await createEntry(api, owner, groupId, event.id);
    const second = await createEntry(api, owner, groupId, event.id);
    await api.gqlOk(member.cookie, LIKE, { id: first.id });
    await api.gqlOk(member.cookie, LIKE, { id: first.id });
    expect((await api.gqlFail(member.cookie, LIKE, { id: second.id })).message).toContain('1개 작품까지만');
    await api.gqlOk(member.cookie, UNLIKE, { id: first.id });
    expect(
      (
        await api.gqlOk<{ likePost: { likedByMe: boolean; contest: { likeLimit: number } } }>(
          member.cookie,
          LIKE,
          { id: second.id },
        )
      ).likePost,
    ).toMatchObject({ likedByMe: true, contest: { likeLimit: 1 } });
    expect(await api.db.postLike.count({ where: { userId: member.id, post: { contestId: event.id } } })).toBe(
      1,
    );
  });

  it('사용자·대회별로 독립 집계하고 일반 게시물은 제한하지 않아야 한다', async () => {
    const event = await contest(2);
    // 같은 사용자의 동시 게시는 직렬화 충돌로 거절될 수 있어, 집계만 보는 이 사양은 차례로 만든다.
    const entries = [];
    for (let i = 0; i < 3; i++) entries.push(await createEntry(api, owner, groupId, event.id));
    for (const entry of entries.slice(0, 2)) await api.gqlOk(member.cookie, LIKE, { id: entry.id });
    expect((await api.gqlFail(member.cookie, LIKE, { id: entries[2]!.id })).message).toContain(
      '2개 작품까지만',
    );
    await api.gqlOk(owner.cookie, LIKE, { id: entries[2]!.id });
    const other = await contest();
    await api.gqlOk(member.cookie, LIKE, { id: (await createEntry(api, owner, groupId, other.id)).id });
    for (let i = 0; i < 3; i++)
      await api.gqlOk(member.cookie, LIKE, { id: (await createEntry(api, owner, groupId, null)).id });
    await moveGroupContest(api, event.id, 'VOTING');
    await api.gqlOk(member.cookie, CAST_POST_VOTE, { id: event.id, postId: entries[2]!.id });
    expect(await api.db.postContestVote.count({ where: { contestId: event.id, voterId: member.id } })).toBe(
      1,
    );
    expect(await api.db.postLike.count({ where: { userId: member.id, post: { contestId: event.id } } })).toBe(
      2,
    );
  });

  it('서로 다른 작품에 동시에 요청해도 기본 한도 1을 넘기지 않아야 한다', async () => {
    const event = await contest();
    const entries = [];
    for (let i = 0; i < 8; i++) entries.push(await createEntry(api, owner, groupId, event.id));
    const reported = vi.spyOn(monitoring, 'reportUnexpectedError');
    try {
      const results = await Promise.all(entries.map(({ id }) => api.gql(member.cookie, LIKE, { id })));
      expect(reported).not.toHaveBeenCalled();
      expect(results.filter(({ errors }) => !errors?.length)).toHaveLength(1);
      const failures = results.flatMap(({ errors }) => errors ?? []);
      expect(failures).toHaveLength(7);
      for (const failure of failures) expect(failure.message).toContain('1개 작품까지만');
    } finally {
      reported.mockRestore();
    }
    expect(await api.db.postLike.count({ where: { userId: member.id, post: { contestId: event.id } } })).toBe(
      1,
    );
  });
});
