import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import config, { adminServerSettings, localAdminGuard } from './vite.config';

function call(method: string, url: string, origin?: string) {
  const req = new IncomingMessage(new Socket());
  req.method = method;
  req.url = url;
  if (origin) req.headers.origin = origin;
  const res = new ServerResponse(req);
  const end = vi.spyOn(res, 'end').mockImplementation(() => res);
  const next = vi.fn();
  localAdminGuard(3303)(req, res, next);
  return { res, end, next };
}
afterEach(() => vi.unstubAllEnvs());

describe('로컬 Admin 프록시 Origin 가드', () => {
  it.each(['http://127.0.0.1:3303', 'http://localhost:3303'])(
    '이 화면(%s)의 쓰기 요청만 프록시로 넘긴다',
    (origin) => {
      const { next, end } = call('POST', '/api/admin/users/user-1/ban', origin);
      expect(next).toHaveBeenCalledOnce();
      expect(end).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['다른 사이트', 'https://foreign.example'],
    ['다른 포트', 'http://127.0.0.1:3300'],
    ['Origin 없음', undefined],
  ])('%s의 쓰기 요청은 API에 닿기 전에 403으로 막는다', (_, origin) => {
    const { res, end, next } = call('PATCH', '/api/admin/support/thread-1', origin);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.getHeader('content-type')).toBe('application/json');
    expect(JSON.parse(String(end.mock.calls[0]?.[0]))).toMatchObject({ errorCode: 'INVALID_ORIGIN' });
  });

  it('읽기 요청과 /api 밖의 요청은 Origin과 관계없이 통과시킨다', () => {
    for (const [method, url] of [
      ['GET', '/api/admin/support'],
      ['HEAD', '/api/session'],
      ['OPTIONS', '/api/admin/support'],
      ['POST', '/src/main.tsx'],
    ] as const)
      expect(call(method, url, 'https://foreign.example').next).toHaveBeenCalledOnce();
  });
});

describe('프로젝트 루트 설정', () => {
  it('로컬 모드는 API가 허용하는 Origin만 바꾸고 Authorization을 붙이지 않는다', () => {
    const settings = adminServerSettings({ GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4304' });
    expect(settings.proxy['/api']).toMatchObject({ target: 'http://127.0.0.1:4304', changeOrigin: true });
    expect(settings.proxy['/api']?.headers).toEqual({ Origin: 'http://localhost:3300' });
  });

  it('웹 Origin을 재사용하고 인증 정보는 주입하지 않는다', () => {
    const settings = adminServerSettings({
      WEB_ORIGIN: 'https://feedback.example',
      GAME_FEEDBACK_API_URL: 'http://127.0.0.1:14300',
    });
    expect(settings.proxy['/api']?.headers).toEqual({
      Origin: 'https://feedback.example',
    });
  });

  it.each([
    [{ GAME_FEEDBACK_API_URL: 'http://10.0.0.5:4300' }, 'local Game Feedback API'],
    [{ GAME_FEEDBACK_API_URL: 'https://127.0.0.1:4300' }, 'local Game Feedback API'],
    [{ GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4300/api' }, 'local Game Feedback API'],
    [{ GAME_FEEDBACK_API_URL: 'http://user:secret@127.0.0.1:4300' }, 'local Game Feedback API'],
  ])('잘못된 운영 설정으로 시작하지 않는다: %j', (env, message) => {
    expect(() => adminServerSettings(env)).toThrow(message);
  });

  it('브라우저 번들에는 운영 모드 표시만 넘기고 토큰은 넘기지 않는다', () => {
    vi.stubEnv('ENVIRONMENT', 'production');
    vi.stubEnv('GAME_FEEDBACK_API_URL', 'http://127.0.0.1:14300');
    vi.stubEnv('GF_S3_SECRET_ACCESS_KEY', 'private-fixture');
    const resolved = config({ command: 'build', mode: 'production' });
    expect(resolved.define).toEqual({ 'import.meta.env.ENVIRONMENT': '"production"' });
    expect(JSON.stringify(resolved.define)).not.toContain('private-fixture');
    expect(resolved.server?.headers).toMatchObject({ 'X-Frame-Options': 'DENY' });
    expect(resolved.preview?.proxy).toBe(resolved.server?.proxy);
  });
});
