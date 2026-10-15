import type { ApolloCache } from '@apollo/client';

/** 새 사진·숨김·가입으로 홈 목록의 구성이나 offset이 바뀌면 첫 페이지부터 다시 읽는다. */
export function resetPhotoFeed(cache: ApolloCache) {
  cache.evict({ id: 'ROOT_QUERY', fieldName: 'myPhotoFeed' });
}
