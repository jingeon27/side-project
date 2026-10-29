import type { IFeedSnapshot } from './feed-snapshot.type';

/** 서버 snapshot을 피드 검색 문자열로 바꾼다. 첫 HTML과 hydration은 URL 대신 이 값을 읽는다. */
export function feedSnapshotSearch({ q, tab }: Pick<IFeedSnapshot, 'q' | 'tab'>) {
  return `?${new URLSearchParams({ q, tab })}`;
}
