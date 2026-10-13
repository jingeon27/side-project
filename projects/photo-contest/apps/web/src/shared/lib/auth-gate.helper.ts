import { NEXT_PATH_PARAM, SESSION_COOKIE_NAME } from '../constants/auth';
import { ROUTES } from '../constants/routes';

/** API의 cookie-header 파서와 같은 상한. 넘으면 형식 오류로 보고 비로그인 취급한다. */
const MAX_COOKIE_HEADER_LENGTH = 4096;
const MAX_NEXT_PATH_LENGTH = 2048;
// 줄바꿈 등 제어 문자로 헤더·로그를 오염시키는 값을 막는다.
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export type TAuthGateDecision = { type: 'allow' } | { type: 'redirect'; location: string };

/**
 * 요청의 `Cookie` 헤더 원문에서 이름이 같은 첫 쿠키 값을 꺼낸다.
 * 공백·세미콜론을 정리하고 퍼센트 인코딩을 푼다. 헤더가 너무 길거나 값이 깨졌으면 null.
 */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader || cookieHeader.length > MAX_COOKIE_HEADER_LENGTH) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    const unquoted = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    try {
      return decodeURIComponent(unquoted);
    } catch {
      return null;
    }
  }
  return null;
}

/** 세션 쿠키가 있는지만 본다. 만료 여부는 API가 판단한다. */
export function hasSessionCookie(cookieHeader: string | null | undefined) {
  return Boolean(readCookie(cookieHeader, SESSION_COOKIE_NAME));
}

/** 로그인해야 볼 수 있는 화면인지. proxy.ts의 matcher와 같은 범위다. */
export function isMemberOnlyPath(pathname: string) {
  return (
    pathname === ROUTES.ME ||
    pathname === '/groups' ||
    pathname.startsWith('/groups/') ||
    pathname === '/contests' ||
    pathname.startsWith('/contests/')
  );
}

/** `/?next=<원래 경로+쿼리>` */
export function buildLoginRedirectPath(nextPath: string) {
  return `${ROUTES.HOME}?${new URLSearchParams({ [NEXT_PATH_PARAM]: nextPath }).toString()}`;
}

/** 멤버 전용 화면에 세션 쿠키 없이 들어오면 홈의 로그인 패널로 보낸다. */
export function decideAuthGate({
  pathname,
  search,
  cookieHeader,
}: {
  pathname: string;
  search: string;
  cookieHeader: string | null | undefined;
}): TAuthGateDecision {
  if (!isMemberOnlyPath(pathname) || hasSessionCookie(cookieHeader)) return { type: 'allow' };
  return { type: 'redirect', location: buildLoginRedirectPath(`${pathname}${search}`) };
}

/** 로그인 뒤 이동할 경로. 같은 origin의 상대 경로가 아니면 홈으로 보낸다(열린 리디렉션 방지). */
export function getSafeNextPath(next: string | null | undefined) {
  if (
    !next ||
    next.length > MAX_NEXT_PATH_LENGTH ||
    !next.startsWith('/') ||
    next.startsWith('//') ||
    next.includes('\\') ||
    CONTROL_CHARACTER.test(next)
  )
    return ROUTES.HOME;
  return next;
}
