import qs from 'qs';

import { parseBattleMode } from '@/features/battle';
import { parseCoachingRole } from '@/features/coaching';
import { parseFeedbackStatus } from '@/features/post';
import { parseSearch } from '@/shared/lib/query-string';

import type { IBoardSnapshot } from './board-snapshot.type';

export function readBoardFilters(search: string) {
  const params = parseSearch(search);
  return {
    q: (params.q ?? '').trim().slice(0, 100),
    battleMode: parseBattleMode(params.battleMode),
    coachingRole: parseCoachingRole(params.coachingRole),
    feedbackStatus: parseFeedbackStatus(params.feedbackStatus),
  };
}
export type TBoardFilters = ReturnType<typeof readBoardFilters>;

export function boardSnapshotSearch(initial: IBoardSnapshot) {
  return qs.stringify(
    {
      game: initial.game.slug,
      q: initial.q || undefined,
      battleMode: initial.battleMode,
      coachingRole: initial.coachingRole,
      feedbackStatus: initial.feedbackStatus,
    },
    { addQueryPrefix: true },
  );
}
