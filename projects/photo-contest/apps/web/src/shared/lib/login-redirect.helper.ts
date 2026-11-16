import qs from 'qs';

import { NEXT_PATH_PARAM } from '../constants/auth';
import { ROUTES } from '../constants/routes';

const MAX_NEXT_PATH_LENGTH = 2048;
// 줄바꿈 등 제어 문자로 헤더·로그를 오염시키는 값을 막는다.
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/** `/sign?next=<원래 경로+쿼리>` */
export function buildLoginRedirectPath(nextPath: string) {
  return `${ROUTES.SIGN}${qs.stringify({ [NEXT_PATH_PARAM]: getSafeNextPath(nextPath) }, { addQueryPrefix: true })}`;
}

/**
 * 로그인 뒤 이동할 경로. 같은 origin의 상대 경로가 아니면 홈으로 보낸다(열린 리디렉션 방지).
 * 같은 키가 반복된 쿼리는 배열로 들어오므로 문자열이 아닌 값도 받아 홈으로 보낸다.
 */
export function getSafeNextPath(next: unknown) {
  if (
    typeof next !== 'string' ||
    !next ||
    next.length > MAX_NEXT_PATH_LENGTH ||
    !next.startsWith('/') ||
    next.startsWith('//') ||
    /^\/(sign|login)(?:[/?#]|$)/.test(next) ||
    next.includes('\\') ||
    CONTROL_CHARACTER.test(next)
  )
    return ROUTES.HOME;
  return next;
}
