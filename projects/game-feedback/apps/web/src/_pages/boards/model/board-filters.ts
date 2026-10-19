import { parseBattleMode } from '@/features/battle';
import { parseCoachingRole } from '@/features/coaching';
import { parseFeedbackStatus } from '@/features/post';
import type { IBoardSnapshot } from './board-snapshot.type';

export function readBoardFilters(search: string) {
  const params = new URLSearchParams(search);
  return {
    q: (params.get('q') ?? '').trim().slice(0, 100),
    battleMode: parseBattleMode(params.get('battleMode')),
    coachingRole: parseCoachingRole(params.get('coachingRole')),
    feedbackStatus: parseFeedbackStatus(params.get('feedbackStatus')),
  };
}
export type TBoardFilters = ReturnType<typeof readBoardFilters>;

export function boardSnapshotSearch(initial: IBoardSnapshot) {
  const params = new URLSearchParams({ game: initial.game.slug });
  if (initial.q) params.set('q', initial.q);
  if (initial.battleMode) params.set('battleMode', initial.battleMode);
  if (initial.coachingRole) params.set('coachingRole', initial.coachingRole);
  if (initial.feedbackStatus) params.set('feedbackStatus', initial.feedbackStatus);
  return `?${params}`;
}
