import { describe, expect, it } from 'vitest';

import { buildLeaderboard, type ILeaderboardSubmission } from './leaderboard';

interface ITestUser {
  id: string;
  nickname: string;
}

const user = (id: string, nickname = id): ITestUser => ({ id, nickname });

function photo(contestId: string, author: ITestUser, voteCount: number, likeCount = 0) {
  return { contestId, user: author, voteCount, likeCount } satisfies ILeaderboardSubmission<ITestUser>;
}

function summary(submissions: ILeaderboardSubmission<ITestUser>[]) {
  return buildLeaderboard(submissions).map(
    ({ rank, user: { id }, wins, votesReceived, likesReceived, submissions }) => ({
      rank,
      id,
      wins,
      votesReceived,
      likesReceived,
      submissions,
    }),
  );
}

describe('그룹 순위', () => {
  it('대회마다 최다 득표 사진을 우승으로 세고 받은 표·좋아요·제출 수를 합해야 한다', () => {
    const [a, b, c] = [user('a'), user('b'), user('c')];
    expect(
      summary([
        photo('c1', a, 3, 1),
        photo('c1', b, 1, 4),
        photo('c2', a, 0, 2),
        photo('c2', b, 2, 0),
        photo('c2', c, 2, 1),
      ]),
    ).toEqual([
      { rank: 1, id: 'b', wins: 1, votesReceived: 3, likesReceived: 4, submissions: 2 },
      { rank: 1, id: 'a', wins: 1, votesReceived: 3, likesReceived: 3, submissions: 2 },
      { rank: 3, id: 'c', wins: 1, votesReceived: 2, likesReceived: 1, submissions: 1 },
    ]);
  });

  it('표가 하나도 없는 대회는 우승자를 만들지 않아야 한다', () => {
    const [a, b] = [user('a'), user('b')];
    expect(summary([photo('c1', a, 0, 5), photo('c1', b, 0)])).toEqual([
      { rank: 1, id: 'a', wins: 0, votesReceived: 0, likesReceived: 5, submissions: 1 },
      { rank: 1, id: 'b', wins: 0, votesReceived: 0, likesReceived: 0, submissions: 1 },
    ]);
  });

  it('우승과 받은 표가 같으면 같은 순위를 주고 다음 순위를 건너뛰어야 한다', () => {
    const [a, b, c, d] = [user('a'), user('b'), user('c'), user('d')];
    const ranks = summary([
      photo('c1', a, 2),
      photo('c1', b, 2),
      photo('c2', c, 1),
      photo('c2', d, 1),
      photo('c3', d, 0),
    ]).map(({ id, rank }) => [id, rank]);
    expect(ranks).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
      ['d', 3],
    ]);
  });

  it('같은 순위 안에서는 좋아요 내림차순, 닉네임·ID 오름차순으로 정렬해야 한다', () => {
    const entries = buildLeaderboard([
      photo('c1', user('u3', '나리'), 0, 0),
      photo('c1', user('u2', '가람'), 0, 0),
      photo('c1', user('u1', '가람'), 0, 0),
      photo('c1', user('u4', '하늘'), 0, 3),
    ]);
    expect(entries.map(({ user: { id }, rank }) => [id, rank])).toEqual([
      ['u4', 1],
      ['u1', 1],
      ['u2', 1],
      ['u3', 1],
    ]);
  });

  it('제출 기록이 없으면 빈 순위를 돌려줘야 한다', () => {
    expect(buildLeaderboard([])).toEqual([]);
  });
});
