import { groupBy, mapValues, maxBy, orderBy, sumBy, uniqBy } from 'es-toolkit';

export interface ILeaderboardUser {
  id: string;
  nickname: string;
}

/** 종료된 대회의 숨기지 않은 사진 한 장 */
export interface ILeaderboardSubmission<TUser extends ILeaderboardUser> {
  contestId: string;
  user: TUser;
  voteCount: number;
  likeCount: number;
}

export interface ILeaderboardEntry<TUser extends ILeaderboardUser> {
  rank: number;
  user: TUser;
  wins: number;
  votesReceived: number;
  likesReceived: number;
  submissions: number;
}

type TLeaderboardTotals<TUser extends ILeaderboardUser> = Omit<ILeaderboardEntry<TUser>, 'rank'>;

function sameRank<TUser extends ILeaderboardUser>(
  a: TLeaderboardTotals<TUser>,
  b: TLeaderboardTotals<TUser>,
) {
  return a.wins === b.wins && a.votesReceived === b.votesReceived;
}

/**
 * 그룹 순위. 대회마다 최다 득표(1표 이상)인 사진이 모두 우승이다.
 * 정렬은 우승·받은 표·받은 좋아요 내림차순, 닉네임·ID 오름차순.
 * 순위는 (우승, 받은 표)가 같으면 같은 경쟁 순위(1, 1, 3)다. 제출 기록이 없는 사용자는 나오지 않는다.
 */
export function buildLeaderboard<TUser extends ILeaderboardUser>(
  submissions: readonly ILeaderboardSubmission<TUser>[],
): ILeaderboardEntry<TUser>[] {
  const topVotes = mapValues(
    groupBy(submissions, (submission) => submission.contestId),
    (items) => maxBy(items, (submission) => submission.voteCount)?.voteCount ?? 0,
  );
  const isWinner = (submission: ILeaderboardSubmission<TUser>) =>
    submission.voteCount > 0 && submission.voteCount === topVotes[submission.contestId];
  const byUser = groupBy(submissions, (submission) => submission.user.id);
  const users = uniqBy(
    submissions.map((submission) => submission.user),
    (user) => user.id,
  );
  const totals = users.map((user): TLeaderboardTotals<TUser> => {
    const mine = byUser[user.id] ?? [];
    return {
      user,
      wins: mine.filter(isWinner).length,
      votesReceived: sumBy(mine, (submission) => submission.voteCount),
      likesReceived: sumBy(mine, (submission) => submission.likeCount),
      submissions: mine.length,
    };
  });
  const sorted = orderBy(
    totals,
    [
      (total) => total.wins,
      (total) => total.votesReceived,
      (total) => total.likesReceived,
      (total) => total.user.nickname,
      (total) => total.user.id,
    ],
    ['desc', 'desc', 'desc', 'asc', 'asc'],
  );
  const entries: ILeaderboardEntry<TUser>[] = [];
  sorted.forEach((total, index) => {
    const previous = entries[index - 1];
    const rank = previous && sameRank(previous, total) ? previous.rank : index + 1;
    entries.push({ rank, ...total });
  });
  return entries;
}
