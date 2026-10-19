import type { GalleryPostsQuery, PublicGroupSeoQuery } from '@/shared/api/generated';

export interface IGroupSeoData {
  group: PublicGroupSeoQuery['group'];
  posts: GalleryPostsQuery['galleryPosts'];
}
