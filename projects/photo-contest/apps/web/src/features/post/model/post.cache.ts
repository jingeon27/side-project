import type { ApolloCache } from '@apollo/client';

export function resetGalleryPosts(cache: ApolloCache) {
  cache.evict({ id: 'ROOT_QUERY', fieldName: 'galleryPosts' });
  cache.evict({ id: 'ROOT_QUERY', fieldName: 'publicGalleryPosts' });
  cache.gc();
}
