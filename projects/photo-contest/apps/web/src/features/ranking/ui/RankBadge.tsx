import { Medal } from 'lucide-react';

import { Badge } from '@/shared/ui/@core/badge';

import { getMedalTone, getRankLabel } from '../lib/ranking.helper';

interface IRankBadgeProps {
  rank: number;
  /** 같은 순위인 사진(사람) 수. 2 이상이면 "공동"을 붙인다. */
  sameRankCount: number;
  className?: string;
}

/** 순위 배지. 1~3위는 메달 색과 아이콘, 그 밖은 차분한 배지. 색만이 아니라 글자로도 순위를 알린다. */
export function RankBadge({ rank, sameRankCount, className }: IRankBadgeProps) {
  const medal = getMedalTone(rank);
  return (
    <Badge tone={medal ?? 'neutral'} className={className}>
      {medal ? <Medal aria-hidden className="size-3.5" /> : null}
      {getRankLabel(rank, sameRankCount)}
    </Badge>
  );
}
