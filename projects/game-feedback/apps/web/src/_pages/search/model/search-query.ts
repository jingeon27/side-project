import { parseBattleMode } from '@/features/battle';
import { boardBySlug } from '@/features/board';
import { parseCoachingRole } from '@/features/coaching';
import { parseFeedbackStatus, type TPostListParams } from '@/features/post';
import type { PostList } from '@/shared/api';
import { parseSearch } from '@/shared/lib/query-string';

export interface ISearchSnapshot {
  path: string;
  posts: PostList | null;
  viewerId?: string;
}

export function searchQuery(path: string) {
  const params = parseSearch(path.split('?')[1] ?? '');
  const board = boardBySlug(params.board ?? '');
  const unanswered = !board && params.tab === 'unanswered';
  const request = {
    feedbackStatus: parseFeedbackStatus(params.feedbackStatus),
    q: params.q?.trim().slice(0, 100) ?? '',
    board: unanswered ? 'FEEDBACK' : (board?.kind ?? 'ALL'),
    category: params.game ?? (board ? 'clash-royale' : undefined),
    battleMode: parseBattleMode(params.battleMode),
    coachingRole: parseCoachingRole(params.coachingRole),
    ...(unanswered ? { unanswered: 'true' as const } : {}),
    limit: 12,
  } satisfies TPostListParams;
  return { board, request };
}
