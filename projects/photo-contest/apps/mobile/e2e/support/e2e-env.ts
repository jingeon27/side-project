/** 모바일 e2e 전용 포트. 개발 서버(3200/4200)·웹 e2e(3320/4320)와 겹치지 않는다. */
export const E2E_API_PORT = 4330;
export const E2E_WEB_PORT = 3330;
export const E2E_WEB_ORIGIN = `http://localhost:${E2E_WEB_PORT}`;
/** 테스트 데이터를 준비할 때 웹 프록시를 거치지 않고 API를 직접 부른다. */
export const E2E_API_URL = `http://127.0.0.1:${E2E_API_PORT}`;
export const E2E_APP_VERSION = '1.0.0';
/** 로그인 밖의 딥링크 스킴 */
export const E2E_APP_SCHEME = 'photocontest';
/** 테스트 API가 앱 로그인 코드를 보내는 콜백(WEB_ORIGIN의 /app-auth/callback) */
export const E2E_AUTH_CALLBACK_URL = `${E2E_WEB_ORIGIN}/app-auth/callback`;
