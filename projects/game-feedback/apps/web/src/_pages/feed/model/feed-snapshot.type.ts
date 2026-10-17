import type { PostList } from '@/shared/api';

export interface IFeedSnapshot {
  posts: PostList;
  q: string;
  tab: string;
  viewerId?: string;
}
