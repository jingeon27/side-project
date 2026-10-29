import { maxBy, orderBy } from 'es-toolkit';

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

/** 득표순 경쟁 순위. 같은 순위 안에서는 좋아요 많은 순, 먼저 낸 순이다(마지막은 id로 고정). */
export function rankResults<TItem extends IRankableSubmission>(
  items: readonly TItem[],
): IRankedResult<TItem>[] {
  const topVotes = maxBy(items, (item) => item.voteCount)?.voteCount ?? 0;
  const sorted = orderBy(
    items,
    [
      (item) => item.voteCount,
      (item) => item.likeCount,
      (item) => item.createdAt.getTime(),
      (item) => item.id,
    ],
    ['desc', 'desc', 'asc', 'asc'],
  );
  const results: IRankedResult<TItem>[] = [];
  sorted.forEach((item, index) => {
    const previous = results[index - 1];
    const rank = previous && previous.item.voteCount === item.voteCount ? previous.rank : index + 1;
    results.push({ item, rank, winner: topVotes > 0 && item.voteCount === topVotes });
  });
  return results;
}
