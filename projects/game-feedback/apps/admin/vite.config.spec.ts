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

describe('관리자 전용 프록시', () => {
  it('기본 설정은 운영 SSH 터널이고 브라우저 쿠키를 그대로 사용한다', () => {
    const settings = adminServerSettings({});
    expect(settings.proxy['/api']).toMatchObject({ target: 'http://127.0.0.1:14300', changeOrigin: true });
    expect(settings.proxy['/api']?.headers).toEqual({ Origin: 'https://game.bambyul.com' });
  });
  it('격리된 API와 Origin을 명시할 수 있다', () => {
    const settings = adminServerSettings({
      GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4304',
      WEB_ORIGIN: 'http://127.0.0.1:3304',
    });
    expect(settings.proxy['/api']?.headers).toEqual({ Origin: 'http://127.0.0.1:3304' });
  });
  it.each([
    'http://10.0.0.5:4300',
    'https://127.0.0.1:4300',
    'http://127.0.0.1:4300/api',
    'http://user:secret@127.0.0.1:4300',
  ])('loopback HTTP origin 외에는 연결하지 않는다: %s', (target) => {
    expect(() => adminServerSettings({ GAME_FEEDBACK_API_URL: target })).toThrow('local Game Feedback API');
  });
  it('브라우저에 자격 증명을 주입하지 않고 framing 방지를 유지한다', () => {
    const resolved = config({ command: 'build', mode: 'production' });
    expect(resolved.define).toBeUndefined();
    expect(resolved.server?.headers).toMatchObject({ 'X-Frame-Options': 'DENY' });
    expect(resolved.preview?.proxy).toBe(resolved.server?.proxy);
  });
});
