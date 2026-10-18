import { boardBySlug } from '@/features/board';
import { parseBattleMode } from '@/features/battle';
import { parseCoachingRole } from '@/features/coaching';
import { parseFeedbackStatus, type TPostListParams } from '@/features/post';
import type { PostList } from '@/shared/api';

export interface ISearchSnapshot {
  path: string;
  posts: PostList | null;
  viewerId?: string;
}

export function searchQuery(path: string) {
  const params = new URLSearchParams(path.split('?')[1] ?? '');
  const board = boardBySlug(params.get('board') ?? '');
  const unanswered = !board && params.get('tab') === 'unanswered';
  const request = {
    feedbackStatus: parseFeedbackStatus(params.get('feedbackStatus')),
    q: params.get('q')?.trim().slice(0, 100) ?? '',
    board: unanswered ? 'FEEDBACK' : (board?.kind ?? 'ALL'),
    category: params.get('game') ?? (board ? 'clash-royale' : undefined),
    battleMode: parseBattleMode(params.get('battleMode')),
    coachingRole: parseCoachingRole(params.get('coachingRole')),
    ...(unanswered ? { unanswered: 'true' as const } : {}),
    limit: 12,
  } satisfies TPostListParams;
  return { board, request };
}
