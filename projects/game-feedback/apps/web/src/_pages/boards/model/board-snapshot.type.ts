import type { Category, PostList } from '@/shared/api';

export interface IBoardSnapshot {
  game: Category;
  posts: PostList;
  q: string;
  viewerId?: string;
}
