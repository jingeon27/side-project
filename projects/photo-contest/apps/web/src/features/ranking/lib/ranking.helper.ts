import { match, P } from 'ts-pattern';

export type TMedalTone = 'gold' | 'silver' | 'bronze';

/** 1~3위에 메달 색을 준다. 같은 순위(공동 1위)는 같은 메달이다. */
export function getMedalTone(rank: number): TMedalTone | null {
  return match(rank)
    .returnType<TMedalTone | null>()
    .with(1, () => 'gold')
    .with(2, () => 'silver')
    .with(3, () => 'bronze')
    .otherwise(() => null);
}

/** 순위마다 몇 명(몇 장)이 있는지. 공동 순위를 표시할 때 쓴다. */
export function countByRank(items: readonly { rank: number }[]) {
  const counts = new Map<number, number>();
  for (const { rank } of items) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  return counts;
}

/** `1위`, 같은 순위가 여럿이면 `공동 1위` */
export function getRankLabel(rank: number, sameRankCount: number) {
  return sameRankCount > 1 ? `공동 ${rank}위` : `${rank}위`;
}

/** 대회 결과 배너 문구: 우승작 수(0이면 무투표)에 따라 */
export function getResultHeadline(winnerCount: number) {
  return match(winnerCount)
    .with(0, () => ({
      title: '이번 대회는 우승작 없이 마무리됐어요',
      description: '유효한 표를 받은 사진이 없어요. 다음 대회에서 다시 만나요.',
    }))
    .with(1, () => ({
      title: '이번 대회 최고의 웃음!',
      description: '모든 참여가 우리의 추억이에요.',
    }))
    .with(P.number, () => ({
      title: '함께 웃겼다면, 함께 우승!',
      description: '득표수가 같으면 공동 우승이에요.',
    }))
    .exhaustive();
}
