import { updateSearch } from '../../lib/query-string.helper';
import { pickOverlayState } from './overlay-history.store';

/**
 * 화면 상태(정렬 등)를 주소에 남긴다. 기록을 쌓지 않도록 replaceState를 쓰고,
 * Next가 감싼 replaceState가 useSearchParams를 갱신한다. null·undefined 값은 지운다.
 */
export function replaceSearchParams(updates: Record<string, string | null | undefined>) {
  const { pathname, search, hash } = window.location;
  window.history.replaceState(
    pickOverlayState(window.history.state),
    '',
    `${pathname}${updateSearch(search, updates)}${hash}`,
  );
}
