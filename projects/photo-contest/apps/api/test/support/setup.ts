import { afterEach, vi } from 'vitest';

// 테스트가 바꾼 환경변수(NODE_ENV·OAuth 키)와 경계 fetch 대체를 테스트가 끝나는 즉시 되돌린다.
// 설정의 unstubEnvs는 다음 테스트 직전에야 되돌리므로 그 사이의 beforeAll·afterAll이 바뀐 값을 보게 된다.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
