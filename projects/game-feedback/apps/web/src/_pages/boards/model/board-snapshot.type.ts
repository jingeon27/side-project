import type { Category, PostList } from '@/shared/api';
import type { TBattleMode, TCoachingRole, TFeedbackStatus } from '@game-feedback/contracts';

export interface IBoardSnapshot {
  game: Category;
  posts: PostList;
  q: string;
  feedbackStatus?: TFeedbackStatus;
  battleMode?: TBattleMode;
  coachingRole?: TCoachingRole;
  viewerId?: string;
}
