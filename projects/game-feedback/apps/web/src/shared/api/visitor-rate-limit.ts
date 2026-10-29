/** 방문자 주소마다 분당 받는 게시글·프로필 상세 문서·RSC 요청 수. API의 익명 조회 예산(분당 240)과 같다. */
export const PUBLIC_LOOKUP_PAGES_PER_MINUTE = 240;

/**
 * Fixed-window request budget per visitor address in this web process. The proxy uses it for pages whose render
 * fills a shared `'use cache'` entry from a URL id: that cached call cannot carry the visitor, so without this
 * one address could spend the API's shared internal budget with random ids.
 */
export class VisitorRateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly maxEntries = 10_000,
  ) {}

  /** Returns zero when allowed, otherwise the Retry-After value in seconds. */
  consume(visitor: string, now = Date.now()) {
    const current = this.windows.get(visitor);
    const window = current && now - current.start < this.windowMs ? current : { start: now, count: 0 };
    window.count += 1;
    // 최근에 본 주소를 뒤로 보내고, 상한을 넘으면 가장 오래 보지 않은 주소부터 버린다.
    this.windows.delete(visitor);
    this.windows.set(visitor, window);
    for (const key of this.windows.keys()) {
      if (this.windows.size <= this.maxEntries) break;
      this.windows.delete(key);
    }
    return window.count > this.limit
      ? Math.max(1, Math.ceil((this.windowMs - (now - window.start)) / 1000))
      : 0;
  }
}
