import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../support/app';
import { contestSchedule, createContest, createGroup } from '../support/fixtures';
import {
  CAST_POST_VOTE,
  CREATE_GROUP_CONTEST,
  GROUP_CONTEST,
  GROUP_CONTEST_FIELDS,
  createEntry,
  createGroupContest,
  moveGroupContest,
  postUpload,
} from '../support/group-contest';

const LIST = `query($group:ID!,$filter:GroupContestFilter,$offset:Int,$limit:Int){groupContests(groupId:$group,filter:$filter,offset:$offset,limit:$limit){${GROUP_CONTEST_FIELDS}}}`;
const RESULTS =
  'query($id:ID!){groupContestResults(contestId:$id){rank voteCount winner post{id kind contestId author{id}}}}';
const CREATE_ENTRY =
  'mutation($group:ID!,$upload:ID!,$contest:ID){createPost(groupId:$group,uploadId:$upload,contestId:$contest,title:"선택한 대회",rightsConfirmed:true){id contestId}}';

describe('그룹 게시물 대회 통합', () => {
  let api: ITestApi,
    owner: ITestUser,
    author: ITestUser,
    voter: ITestUser,
    outsider: ITestUser,
    groupId: string;
  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('대회 운영-그룹장');
    author = await api.signIn('대회 운영-참가자');
    voter = await api.signIn('대회 운영-투표자');
    outsider = await api.signIn('대회 운영-외부인');
    groupId = (await createGroup(api, owner, '게시물 대회 공개', [author, voter])).id;
  });
  afterAll(async () => {
    await api.close();
  });

  it('관리자만 특정 그룹에 대회를 개최하고 일정·제목을 검증해야 한다', async () => {
    const variables = { groupId, title: '그룹 전용 대회', ...contestSchedule() };
    for (const actor of [undefined, author.cookie, outsider.cookie]) {
      expect((await api.gqlFail(actor, CREATE_GROUP_CONTEST, variables)).code).toBe(
        actor ? 'FORBIDDEN' : 'UNAUTHENTICATED',
      );
    }
    for (const invalid of [{ title: ' ' }, { endsAt: variables.startsAt }, { submissionEndsAt: 'invalid' }])
      expect((await api.gqlFail(owner.cookie, CREATE_GROUP_CONTEST, { ...variables, ...invalid })).code).toBe(
        'BAD_USER_INPUT',
      );
    const id = await createGroupContest(api, owner, groupId);
    expect(
      (
        await api.gqlOk<{ groupContest: { groupId: string; isAdmin: boolean; canParticipate: boolean } }>(
          owner.cookie,
          GROUP_CONTEST,
          { id },
        )
      ).groupContest,
    ).toMatchObject({ groupId, isAdmin: true, canParticipate: true });
    expect(
      (
        await api.gqlOk<{ groupContest: { isAdmin: boolean; canParticipate: boolean; canVote: boolean } }>(
          undefined,
          GROUP_CONTEST,
          { id },
        )
      ).groupContest,
    ).toMatchObject({ isAdmin: false, canParticipate: false, canVote: false });
  });

  it('공개 대회는 익명 조회하지만 비공개 대회·수상작은 승인된 멤버만 봐야 한다', async () => {
    const privateGroup = await createGroup(api, owner, '비공개 대회 그룹', [author], 'PRIVATE');
    const id = await createGroupContest(api, owner, privateGroup.id);
    await createEntry(api, author, privateGroup.id, id);
    await moveGroupContest(api, id, 'COMPLETED');
    for (const query of [GROUP_CONTEST, RESULTS]) {
      expect((await api.gqlFail(undefined, query, { id })).code).toBe('UNAUTHENTICATED');
      expect((await api.gqlFail(outsider.cookie, query, { id })).code).toBe('FORBIDDEN');
      expect((await api.gql(author.cookie, query, { id })).errors).toBeUndefined();
    }
    expect((await api.gqlFail(undefined, LIST, { group: privateGroup.id })).code).toBe('UNAUTHENTICATED');
    const sitemap = await api.gqlOk<{ publicGroupContests: Array<{ id: string }> }>(
      undefined,
      '{publicGroupContests(limit:48){id}}',
    );
    expect(sitemap.publicGroupContests.some((contest) => contest.id === id)).toBe(false);
  });

  it('일반 게시물·사진 대회 참여·동영상 대회 참여를 구분하고 여러 출품을 허용해야 한다', async () => {
    const id = await createGroupContest(api, owner, groupId);
    const regular = await createEntry(api, author, groupId, null);
    const photo = await createEntry(api, author, groupId, id);
    const video = await createEntry(api, author, groupId, id, true);
    expect(regular.contestId).toBeNull();
    expect(photo).toMatchObject({ kind: 'PHOTO', contestId: id });
    expect(video).toMatchObject({ kind: 'VIDEO', contestId: id });
    const { galleryPosts } = await api.gqlOk<{ galleryPosts: Array<{ id: string }> }>(
      undefined,
      'query($group:ID!,$contest:ID){galleryPosts(groupId:$group,contestId:$contest){id}}',
      { group: groupId, contest: id },
    );
    expect(galleryPosts.map((post) => post.id)).toEqual([video.id, photo.id]);
    expect(galleryPosts.some((post) => post.id === regular.id)).toBe(false);
    expect(
      (await api.gqlOk<{ groupContest: { entryCount: number } }>(undefined, GROUP_CONTEST, { id }))
        .groupContest.entryCount,
    ).toBe(2);
  });

  it('다른 그룹·존재하지 않는 대회·이전 형식의 대회 선택을 막고 파일을 소비하지 않아야 한다', async () => {
    const other = await createGroup(api, owner, '대회 선택 경계');
    const otherId = await createGroupContest(api, owner, other.id);
    const legacy = await createContest(api, owner, groupId);
    const upload = await postUpload(api, author, groupId);
    for (const contest of [otherId, legacy, 'missing']) {
      const failure = await api.gqlFail(author.cookie, CREATE_ENTRY, { group: groupId, upload, contest });
      expect(failure.code).toBe(contest === 'missing' ? 'NOT_FOUND' : 'BAD_USER_INPUT');
      expect(await api.db.post.count({ where: { uploadId: upload } })).toBe(0);
    }
    await api.gqlOk(author.cookie, CREATE_ENTRY, { group: groupId, upload, contest: null });
  });

  it.each(['UPCOMING', 'VOTING', 'COMPLETED'] as const)(
    '%s 단계에는 게시물 출품을 받지 않아야 한다',
    async (target) => {
      const id = await createGroupContest(api, owner, groupId);
      const upload = await postUpload(api, author, groupId);
      await moveGroupContest(api, id, target);
      expect(
        (await api.gqlFail(author.cookie, CREATE_ENTRY, { group: groupId, upload, contest: id })).code,
      ).toBe('BAD_USER_INPUT');
      expect(await api.db.post.count({ where: { contestId: id } })).toBe(0);
    },
  );

  it('투표 기간·소속·본인 출품·다른 대회·숨김 여부를 확인해야 한다', async () => {
    const id = await createGroupContest(api, owner, groupId);
    const post = await createEntry(api, author, groupId, id);
    expect((await api.gqlFail(voter.cookie, CAST_POST_VOTE, { id, postId: post.id })).code).toBe(
      'BAD_USER_INPUT',
    );
    const regular = await createEntry(api, author, groupId, null);
    await moveGroupContest(api, id, 'VOTING');
    expect((await api.gqlFail(undefined, CAST_POST_VOTE, { id, postId: post.id })).code).toBe(
      'UNAUTHENTICATED',
    );
    expect((await api.gqlFail(outsider.cookie, CAST_POST_VOTE, { id, postId: post.id })).code).toBe(
      'FORBIDDEN',
    );
    expect((await api.gqlFail(author.cookie, CAST_POST_VOTE, { id, postId: post.id })).code).toBe(
      'BAD_USER_INPUT',
    );
    expect((await api.gqlFail(voter.cookie, CAST_POST_VOTE, { id, postId: regular.id })).code).toBe(
      'NOT_FOUND',
    );
    await api.db.post.update({ where: { id: post.id }, data: { hidden: true } });
    expect((await api.gqlFail(voter.cookie, CAST_POST_VOTE, { id, postId: post.id })).code).toBe('NOT_FOUND');
    expect(await api.db.postContestVote.count({ where: { contestId: id } })).toBe(0);
  });

  it('동시 투표는 한 표만 저장하고 종료 뒤 투표·결과 변경을 거부해야 한다', async () => {
    const id = await createGroupContest(api, owner, groupId);
    const post = await createEntry(api, author, groupId, id);
    await moveGroupContest(api, id, 'VOTING');
    const votes = await Promise.all(
      Array.from({ length: 8 }, () => api.gql(voter.cookie, CAST_POST_VOTE, { id, postId: post.id })),
    );
    expect(votes.filter((result) => !result.errors)).toHaveLength(1);
    expect(await api.db.postContestVote.count({ where: { contestId: id } })).toBe(1);
    expect((await api.gqlFail(owner.cookie, RESULTS, { id })).code).toBe('BAD_USER_INPUT');
    await moveGroupContest(api, id, 'COMPLETED');
    expect((await api.gqlFail(owner.cookie, CAST_POST_VOTE, { id, postId: post.id })).code).toBe(
      'BAD_USER_INPUT',
    );
    const results = await api.gqlOk<{ groupContestResults: Array<{ winner: boolean; voteCount: number }> }>(
      undefined,
      RESULTS,
      { id },
    );
    expect(results.groupContestResults).toEqual([
      expect.objectContaining({ winner: true, voteCount: 1, rank: 1 }),
    ]);
  });

  it('명예의 전당은 종료 대회와 공동 우승을 보여주고 무투표·숨긴 출품은 수상하지 않아야 한다', async () => {
    const id = await createGroupContest(api, owner, groupId);
    const first = await createEntry(api, author, groupId, id);
    const second = await createEntry(api, voter, groupId, id);
    const third = await createEntry(api, author, groupId, id);
    await moveGroupContest(api, id, 'VOTING');
    await api.gqlOk(owner.cookie, CAST_POST_VOTE, { id, postId: first.id });
    await api.gqlOk(author.cookie, CAST_POST_VOTE, { id, postId: second.id });
    await moveGroupContest(api, id, 'COMPLETED');
    const result = await api.gqlOk<{
      groupContestResults: Array<{ rank: number; winner: boolean; post: { id: string } }>;
    }>(undefined, RESULTS, { id });
    expect(result.groupContestResults.map((entry) => [entry.rank, entry.winner])).toEqual([
      [1, true],
      [1, true],
      [3, false],
    ]);
    const hall = await api.gqlOk<{
      groupContests: Array<{ id: string; winners: Array<{ post: { id: string } }> }>;
    }>(
      undefined,
      'query($group:ID!){groupContests(groupId:$group,filter:COMPLETED,limit:48){id winners{post{id}}}}',
      { group: groupId },
    );
    expect(
      hall.groupContests
        .find((contest) => contest.id === id)
        ?.winners.map((entry) => entry.post.id)
        .sort(),
    ).toEqual([first.id, second.id].sort());
    expect(
      hall.groupContests
        .find((contest) => contest.id === id)
        ?.winners.some((entry) => entry.post.id === third.id),
    ).toBe(false);
    const noVotes = await createGroupContest(api, owner, groupId);
    await createEntry(api, author, groupId, noVotes);
    await moveGroupContest(api, noVotes, 'COMPLETED');
    expect(
      (
        await api.gqlOk<{ groupContest: { winners: unknown[] } }>(
          undefined,
          'query($id:ID!){groupContest(id:$id){winners{rank}}}',
          { id: noVotes },
        )
      ).groupContest.winners,
    ).toEqual([]);
  });

  it('목록 필터·페이지를 분리하고 새 대회를 이전 제출 API로 우회하지 못해야 한다', async () => {
    const group = await createGroup(api, owner, '대회 필터 페이지', [author]);
    const ids = [];
    for (let index = 0; index < 3; index++)
      ids.push(await createGroupContest(api, owner, group.id, `필터 ${index}`));
    const first = await api.gqlOk<{ groupContests: Array<{ id: string }> }>(undefined, LIST, {
      group: group.id,
      offset: 0,
      limit: 2,
    });
    const next = await api.gqlOk<{ groupContests: Array<{ id: string }> }>(undefined, LIST, {
      group: group.id,
      offset: 2,
      limit: 2,
    });
    expect([...first.groupContests, ...next.groupContests].map((contest) => contest.id).sort()).toEqual(
      ids.sort(),
    );
    expect((await api.gqlFail(undefined, LIST, { group: group.id, offset: -1 })).code).toBe('BAD_USER_INPUT');
    expect(
      (await api.gqlFail(author.cookie, 'query($id:ID!){contest(id:$id){id}}', { id: ids[0] })).code,
    ).toBe('NOT_FOUND');
    expect(
      (
        await api.gqlFail(author.cookie, 'mutation($id:ID!){requestUploadUrl(contestId:$id){id}}', {
          id: ids[0],
        })
      ).code,
    ).toBe('NOT_FOUND');
  });
  it('새 게시물 대회의 종료 기록도 실제 참여작·투표·참여자 수를 한 번만 집계해야 한다', async () => {
    const id = await createGroupContest(api, owner, groupId);
    const first = await createEntry(api, author, groupId, id);
    await createEntry(api, author, groupId, id);
    await moveGroupContest(api, id, 'VOTING');
    await api.gqlOk(voter.cookie, CAST_POST_VOTE, { id, postId: first.id });
    await moveGroupContest(api, id, 'COMPLETED');
    await api.runScheduledWork();
    await api.runScheduledWork();
    const events = await api.db.analyticsEvent.findMany({ where: { id: `completed:${id}` } });
    expect(events).toHaveLength(1);
    expect(events[0]?.properties).toMatchObject({
      contestId: id,
      submissions: 2,
      votes: 1,
      participants: 2,
      activeContest: false,
    });
  });
});
