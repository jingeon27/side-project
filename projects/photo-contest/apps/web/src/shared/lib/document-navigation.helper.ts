import { isOverlayEntryCurrent, markOverlayNavigation } from '../model/router/overlay-history.store';

/**
 * 라우터를 거치지 않고 문서를 새로 연다. 로그인·로그아웃 뒤 Apollo 캐시를 통째로 버리거나
 * Next 화면이 아닌 `/backend/*`(OAuth 시작)로 갈 때만 쓴다. 화면 사이 이동은 라우터를 쓴다.
 */
export function navigateDocument(path: string, location: Pick<Location, 'assign'> = window.location) {
  if (typeof window !== 'undefined' && isOverlayEntryCurrent()) markOverlayNavigation();
  location.assign(path);
}
