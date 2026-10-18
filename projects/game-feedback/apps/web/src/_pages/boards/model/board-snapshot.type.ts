import type { Category, PostList } from '@/shared/api';
import type { TBattleMode } from '@game-feedback/contracts';

export interface IBoardSnapshot {
  game: Category;
  posts: PostList;
  q: string;
  battleMode?: TBattleMode;
  viewerId?: string;
}
