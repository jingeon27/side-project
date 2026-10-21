import { expirePostDetailCache } from '../api/post-cache.action';

/** 작성자의 Router Cache도 즉시 갱신한다. API의 영속 큐가 서버 캐시 무효화를 별도로 재시도한다. */
export async function refreshServerPostDetail(id: string) {
  try {
    await expirePostDetailCache(id);
  } catch {
    // API가 저장한 무효화 요청은 Next.js 연결 복구 후에도 재시도된다.
  }
}
