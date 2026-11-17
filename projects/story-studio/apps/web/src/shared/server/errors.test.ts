import { describe, expect, it } from 'vitest';

import { requireLocalRequest } from './errors';

describe('Next의 내부 URL 정규화 회귀', () => {
  it('내부 URL이 localhost여도 실제 로컬 브라우저의 Host와 Origin을 허용한다', () => {
    const request = new Request('http://localhost:3400/api/studio', {
      method: 'POST',
      headers: { host: '127.0.0.1:3400', origin: 'http://127.0.0.1:3400' },
    });
    expect(() => requireLocalRequest(request, true)).not.toThrow();
  });
  it('호스트 위조와 서로 다른 포트의 Origin을 계속 차단한다', () => {
    expect(() =>
      requireLocalRequest(
        new Request('http://localhost:3400/api/studio', { headers: { host: 'evil.example' } }),
      ),
    ).toThrow();
    expect(() =>
      requireLocalRequest(
        new Request('http://localhost:3400/api/studio', {
          method: 'POST',
          headers: { host: '127.0.0.1:3400', origin: 'http://127.0.0.1:3401' },
        }),
        true,
      ),
    ).toThrow();
  });
});
