import { expirePostDetailCache } from '../api/post-cache.action';

/** 쓰기 성공 뒤 서버의 게시글 상세 캐시를 비운다. 실패해도 60초 재검증으로 따라잡으므로 화면 갱신을 막지 않는다. */
export async function refreshServerPostDetail(id: string) {
  try {
    await expirePostDetailCache(id);
  } catch {
    // 서버 캐시는 재검증 주기 안에 갱신된다.
  }
}
