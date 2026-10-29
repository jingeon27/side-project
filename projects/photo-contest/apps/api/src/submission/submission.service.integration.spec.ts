import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { minutesFrom, moveContestTo, setSubmittedAt } from '../../test/support/clock';
import { createContest, createGroup, hidePhoto, type ITestGroup } from '../../test/support/fixtures';
import { submitPhoto } from '../../test/support/photos';

const LIST = `
  query($contestId: ID!, $offset: Int, $limit: Int, $sort: SubmissionSort) {
    submissions(contestId: $contestId, offset: $offset, limit: $limit, sort: $sort) { id }
  }
`;
const LIKE = 'mutation($id: ID!) { likeSubmission(submissionId: $id) { id } }';
const INVALID_RANGE = { code: 'BAD_USER_INPUT', message: '올바른 목록 범위를 지정해 주세요.' };

describe('사진 목록', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let first: ITestUser;
  let second: ITestUser;
  let third: ITestUser;
  let group: ITestGroup;
  let contestId: string;
  /** 제출 시각 순서 A < B < C < D */
  let photos: { a: string; b: string; c: string; d: string };

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('목록-관리자');
    first = await api.signIn('목록-첫째');
    second = await api.signIn('목록-둘째');
    third = await api.signIn('목록-셋째');
    group = await createGroup(api, owner, '목록 그룹', [first, second, third]);
    contestId = await createContest(api, owner, group.id, '목록 대회');
    photos = {
      a: await submitPhoto(api, owner, contestId, '사진 A'),
      b: await submitPhoto(api, first, contestId, '사진 B'),
      c: await submitPhoto(api, second, contestId, '사진 C'),
      d: await submitPhoto(api, third, contestId, '사진 D'),
    };
    const base = new Date(Date.now() - 60 * 60 * 1000);
    await setSubmittedAt(api, photos.a, base);
    await setSubmittedAt(api, photos.b, minutesFrom(base, 1));
    await setSubmittedAt(api, photos.c, minutesFrom(base, 2));
    await setSubmittedAt(api, photos.d, minutesFrom(base, 3));
    // 좋아요: A 2개, C 2개, D 1개, B 0개
    await api.gqlOk(first.cookie, LIKE, { id: photos.a });
    await api.gqlOk(second.cookie, LIKE, { id: photos.a });
    await api.gqlOk(first.cookie, LIKE, { id: photos.c });
    await api.gqlOk(third.cookie, LIKE, { id: photos.c });
    await api.gqlOk(owner.cookie, LIKE, { id: photos.d });
  });

  afterAll(async () => {
    await api?.close();
  });

  async function listIds(cookie: string, variables: Record<string, unknown> = {}) {
    const { submissions } = await api.gqlOk<{ submissions: Array<{ id: string }> }>(cookie, LIST, {
      contestId,
      ...variables,
    });
    return submissions.map(({ id }) => id);
  }

  it('기본은 최신순이고 오래된순·좋아요순으로 정렬할 수 있어야 한다', async () => {
    const { a, b, c, d } = photos;
    expect(await listIds(first.cookie)).toEqual([d, c, b, a]);
    expect(await listIds(first.cookie, { sort: 'NEWEST' })).toEqual([d, c, b, a]);
    expect(await listIds(first.cookie, { sort: 'OLDEST' })).toEqual([a, b, c, d]);
    // 좋아요 수가 같으면 최신순
    expect(await listIds(first.cookie, { sort: 'MOST_LIKED' })).toEqual([c, a, d, b]);
  });

  it('같은 시각에 낸 사진은 id로 순서를 고정해야 한다', async () => {
    const tiedContest = await createContest(api, owner, group.id, '동시각 대회');
    const tied = [
      await submitPhoto(api, first, tiedContest, '동시각 1'),
      await submitPhoto(api, second, tiedContest, '동시각 2'),
      await submitPhoto(api, third, tiedContest, '동시각 3'),
    ];
    const sameTime = new Date(Date.now() - 60 * 1000);
    for (const id of tied) await setSubmittedAt(api, id, sameTime);
    const ascending = [...tied].sort();

    const list = async (sort: string) => {
      const { submissions } = await api.gqlOk<{ submissions: Array<{ id: string }> }>(owner.cookie, LIST, {
        contestId: tiedContest,
        sort,
      });
      return submissions.map(({ id }) => id);
    };
    expect(await list('OLDEST')).toEqual(ascending);
    expect(await list('NEWEST')).toEqual([...ascending].reverse());
    expect(await list('MOST_LIKED')).toEqual([...ascending].reverse());
  });

  it('offset·limit으로 나눠 받고 null이면 기본값을 써야 한다', async () => {
    const { a, b, c, d } = photos;
    expect(await listIds(first.cookie, { offset: 0, limit: 2 })).toEqual([d, c]);
    expect(await listIds(first.cookie, { offset: 2, limit: 2 })).toEqual([b, a]);
    expect(await listIds(first.cookie, { offset: 4, limit: 2 })).toEqual([]);
    expect(await listIds(first.cookie, { offset: 1, limit: 48, sort: 'OLDEST' })).toEqual([b, c, d]);
    expect(await listIds(first.cookie, { offset: null, limit: null, sort: null })).toEqual([d, c, b, a]);
  });

  it('offset을 limit만큼 옮겨 이어 받은 페이지를 이으면 정렬마다 한 번에 받은 목록과 같아야 한다', async () => {
    for (const sort of ['NEWEST', 'OLDEST', 'MOST_LIKED']) {
      const whole = await listIds(first.cookie, { sort });
      for (const limit of [1, 3]) {
        const paged: string[] = [];
        // 웹처럼 받은 개수를 다음 offset으로 쓰고, limit보다 적게 오면 멈춘다.
        for (;;) {
          const page = await listIds(first.cookie, { sort, offset: paged.length, limit });
          paged.push(...page);
          if (page.length < limit) break;
        }
        expect(paged, `${sort} limit ${limit}`).toEqual(whole);
      }
    }
  });

  it('관리자가 아니면 숨긴 사진을 뺀 나머지로 페이지를 나눠야 한다', async () => {
    const pagedContest = await createContest(api, owner, group.id, '숨김 페이지 대회');
    const older = await submitPhoto(api, first, pagedContest, '먼저 낸 사진');
    const hidden = await submitPhoto(api, second, pagedContest, '숨길 사진');
    const newer = await submitPhoto(api, third, pagedContest, '나중에 낸 사진');
    const base = new Date(Date.now() - 30 * 60 * 1000);
    await setSubmittedAt(api, older, base);
    await setSubmittedAt(api, hidden, minutesFrom(base, 1));
    await setSubmittedAt(api, newer, minutesFrom(base, 2));
    await hidePhoto(api, owner, hidden);

    const page = (cookie: string, offset: number) =>
      listIds(cookie, { contestId: pagedContest, offset, limit: 1 });
    expect([await page(first.cookie, 0), await page(first.cookie, 1), await page(first.cookie, 2)]).toEqual([
      [newer],
      [older],
      [],
    ]);
    expect([await page(owner.cookie, 0), await page(owner.cookie, 1), await page(owner.cookie, 2)]).toEqual([
      [newer],
      [hidden],
      [older],
    ]);
  });

  it('offset이 음수이거나 limit이 1~48 밖이면 BAD_USER_INPUT이어야 한다', async () => {
    for (const range of [{ offset: -1 }, { limit: 0 }, { limit: 49 }, { limit: -5 }])
      expect(await api.gqlFail(first.cookie, LIST, { contestId, ...range }), JSON.stringify(range)).toEqual(
        INVALID_RANGE,
      );
  });

  it('정수가 아닌 offset·limit과 없는 정렬은 실행 전에 BAD_USER_INPUT이어야 한다', async () => {
    for (const variables of [{ offset: 1.5 }, { limit: 2.5 }, { offset: '1' }, { sort: 'RANDOM' }])
      expect(
        (await api.gqlFail(first.cookie, LIST, { contestId, ...variables })).code,
        JSON.stringify(variables),
      ).toBe('BAD_USER_INPUT');
  });

  it('비회원은 목록을 볼 수 없고 없는 대회는 NOT_FOUND여야 한다', async () => {
    const outsider = await api.signIn('목록-외부인');
    expect(await api.gqlFail(outsider.cookie, LIST, { contestId })).toEqual({
      code: 'NOT_FOUND',
      message: '대회를 찾을 수 없습니다.',
    });
    expect(await api.gqlFail(first.cookie, LIST, { contestId: 'missing-contest' })).toEqual({
      code: 'NOT_FOUND',
      message: '대회를 찾을 수 없습니다.',
    });
  });

  it('숨긴 사진은 관리자 목록에만 보이고 득표수는 종료 후, 신고는 관리자에게만 보여야 한다', async () => {
    const visibility = await createContest(api, owner, group.id, '공개 범위 대회');
    const shown = await submitPhoto(api, first, visibility, '보이는 사진');
    const hidden = await submitPhoto(api, second, visibility, '숨길 사진');
    await api.gqlOk(
      third.cookie,
      'mutation($id: ID!) { reportSubmission(submissionId: $id, reason: "불쾌함") }',
      {
        id: shown,
      },
    );
    await api.gqlOk(owner.cookie, 'mutation($id: ID!) { hideSubmission(submissionId: $id) }', { id: hidden });
    await moveContestTo(api, visibility, 'VOTING');
    await api.gqlOk(
      third.cookie,
      'mutation($c: ID!, $s: ID!) { castVote(contestId: $c, submissionId: $s) { id } }',
      { c: visibility, s: shown },
    );

    const query = `
      query($contestId: ID!) {
        submissions(contestId: $contestId) { id hidden voteCount reportCount reports { reason } }
      }
    `;
    expect(await api.gqlOk(first.cookie, query, { contestId: visibility })).toEqual({
      submissions: [{ id: shown, hidden: false, voteCount: null, reportCount: null, reports: null }],
    });
    expect(await api.gqlOk(owner.cookie, query, { contestId: visibility })).toEqual({
      submissions: [
        { id: hidden, hidden: true, voteCount: null, reportCount: 0, reports: [] },
        { id: shown, hidden: false, voteCount: null, reportCount: 1, reports: [{ reason: '불쾌함' }] },
      ],
    });

    await moveContestTo(api, visibility, 'COMPLETED');
    const completed = await api.gqlOk<{ submissions: Array<{ id: string; voteCount: number | null }> }>(
      first.cookie,
      query,
      { contestId: visibility },
    );
    expect(completed.submissions.map(({ id, voteCount }) => ({ id, voteCount }))).toEqual([
      { id: shown, voteCount: 1 },
    ]);
  });
});
