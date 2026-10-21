export const POST_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/** 게시글 상세 공개 캐시의 태그. 서버 조회와 쓰기 뒤 만료가 같은 값을 쓴다. */
export function postDetailCacheTag(id: string) {
  return `post:${id}`;
}
