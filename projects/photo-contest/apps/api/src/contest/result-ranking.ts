import { compareText } from '../common/sort';

export interface IRankableSubmission {
  id: string;
  voteCount: number;
  likeCount: number;
  createdAt: Date;
}

export interface IRankedResult<TItem extends IRankableSubmission> {
  item: TItem;
  /** 1 + 더 많은 표를 받은 사진 수 (1, 1, 3) */
  rank: number;
  /** 1표 이상 받은 최다 득표 사진은 모두 우승(공동 우승). 무투표면 우승 없음 */
  winner: boolean;
}

function compareResults(a: IRankableSubmission, b: IRankableSubmission) {
  return (
    b.voteCount - a.voteCount ||
    b.likeCount - a.likeCount ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    compareText(a.id, b.id)
  );
}

/** 득표순 경쟁 순위. 같은 순위 안에서는 좋아요 많은 순, 먼저 낸 순이다. */
export function rankResults<TItem extends IRankableSubmission>(
  items: readonly TItem[],
): IRankedResult<TItem>[] {
  const topVotes = Math.max(0, ...items.map((item) => item.voteCount));
  const sorted = [...items].sort(compareResults);
  const results: IRankedResult<TItem>[] = [];
  sorted.forEach((item, index) => {
    const previous = results[index - 1];
    const rank = previous && previous.item.voteCount === item.voteCount ? previous.rank : index + 1;
    results.push({ item, rank, winner: topVotes > 0 && item.voteCount === topVotes });
  });
  return results;
}
