import { compareText } from '../common/sort';

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

function compareEntries<TUser extends ILeaderboardUser>(
  a: TLeaderboardTotals<TUser>,
  b: TLeaderboardTotals<TUser>,
) {
  return (
    b.wins - a.wins ||
    b.votesReceived - a.votesReceived ||
    b.likesReceived - a.likesReceived ||
    compareText(a.user.nickname, b.user.nickname) ||
    compareText(a.user.id, b.user.id)
  );
}

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
  const topVotes = new Map<string, number>();
  for (const submission of submissions)
    topVotes.set(
      submission.contestId,
      Math.max(topVotes.get(submission.contestId) ?? 0, submission.voteCount),
    );
  const totals = new Map<string, TLeaderboardTotals<TUser>>();
  for (const submission of submissions) {
    const top = topVotes.get(submission.contestId) ?? 0;
    const total = totals.get(submission.user.id) ?? {
      user: submission.user,
      wins: 0,
      votesReceived: 0,
      likesReceived: 0,
      submissions: 0,
    };
    total.wins += top > 0 && submission.voteCount === top ? 1 : 0;
    total.votesReceived += submission.voteCount;
    total.likesReceived += submission.likeCount;
    total.submissions += 1;
    totals.set(submission.user.id, total);
  }
  const sorted = [...totals.values()].sort(compareEntries);
  const entries: ILeaderboardEntry<TUser>[] = [];
  sorted.forEach((total, index) => {
    const previous = entries[index - 1];
    const rank = previous && sameRank(previous, total) ? previous.rank : index + 1;
    entries.push({ rank, ...total });
  });
  return entries;
}
