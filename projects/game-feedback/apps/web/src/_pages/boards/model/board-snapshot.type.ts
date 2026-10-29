import type { TBattleMode, TCoachingRole, TFeedbackStatus } from '@game-feedback/contracts';

import type { Category, PostList } from '@/shared/api';

export interface IBoardSnapshot {
  game: Category;
  posts: PostList;
  q: string;
  feedbackStatus?: TFeedbackStatus;
  battleMode?: TBattleMode;
  coachingRole?: TCoachingRole;
  viewerId?: string;
}
