import { APP_MAIN_ID } from '../constants/layout';

/**
 * 시트·대화상자·토스트를 웹 콘텐츠 영역(#pc-main) 안에 띄운다.
 * 서버 렌더링이거나 셸이 없으면(테스트) undefined라 Base UI 기본값(body)을 쓴다.
 */
export function getOverlayContainer() {
  if (typeof document === 'undefined') return undefined;
  return document.getElementById(APP_MAIN_ID) ?? undefined;
}
