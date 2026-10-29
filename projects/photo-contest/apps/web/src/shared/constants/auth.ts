/**
 * API가 발급하는 HttpOnly 세션 쿠키 이름. 운영(https)은 `__Host-` 접두사를 붙이고 개발·테스트(http)는 붙이지 않는다.
 * 웹은 존재 여부만 보고 값은 읽거나 남기지 않는다. 연결된 API의 모드를 웹이 알 수 없으므로 둘 다 본다.
 */
export const SESSION_COOKIE_NAMES = ['__Host-contest_session', 'contest_session'] as const;

/** 로그인 뒤 돌아갈 경로를 싣는 홈 화면 쿼리 이름 */
export const NEXT_PATH_PARAM = 'next';
