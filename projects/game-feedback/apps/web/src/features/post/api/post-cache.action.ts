'use server';

import { updateTag } from 'next/cache';

import { POST_ID_PATTERN, postDetailCacheTag } from './post-cache';

/** 쓴 사람이 바로 새로고침해도 자기 변경을 보도록 게시글 상세의 공개 캐시를 만료한다. */
export async function expirePostDetailCache(id: string) {
  if (!POST_ID_PATTERN.test(id)) return;
  updateTag(postDetailCacheTag(id));
}
