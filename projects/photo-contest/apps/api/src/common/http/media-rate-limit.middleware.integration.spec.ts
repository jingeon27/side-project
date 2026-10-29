import { afterEach, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi } from '../../../test/support/app';
import { MEDIA_RATE_LIMIT_PER_WINDOW } from '../../config/limits';
import { MEDIA_RATE_LIMITED } from './media-rate-limit.middleware';

const ORIGIN = 'https://web.test';

describe('mediaRateLimit', () => {
  let api: ITestApi | undefined;

  afterEach(async () => {
    await api?.close();
    api = undefined;
  });

  /** 브라우저처럼 Caddy를 거친 고정 경로 요청. forwardedFor가 없으면 내부 웹 서버의 요청이다. */
  const open = (path: string, forwardedFor?: string) => {
    if (!api) throw new Error('앱을 먼저 만들어야 한다');
    const pending = api.http().get(path);
    return forwardedFor ? pending.set('X-Forwarded-For', forwardedFor) : pending;
  };

  it('운영에서 고정 미디어·대표 사진 경로를 주소마다 합쳐 분당 요청 수를 제한해야 한다', async () => {
    api = await createTestApp({ NODE_ENV: 'production', WEB_ORIGIN: ORIGIN });
    const paths = ['/media/missing', '/groups/missing/avatar/missing', '/profiles/missing/avatar/missing'];
    for (let index = 0; index < MEDIA_RATE_LIMIT_PER_WINDOW; index++) {
      const response = await open(paths[index % paths.length] ?? '/media/missing', '203.0.113.40');
      if (response.status !== 404) throw new Error(`${index + 1}번째 요청이 ${response.status}로 끝났다`);
    }
    const limited = await open('/media/missing/download', '203.0.113.40');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['cache-control']).toBe('private, no-store');
    expect(limited.body).toEqual({ message: MEDIA_RATE_LIMITED });
    expect((await open('/photos/missing', '203.0.113.40')).status).toBe(429);
    // 다른 주소, 미디어가 아닌 경로, 전달 헤더 없는 내부 웹 서버 요청은 이 제한에 섞지 않는다.
    expect((await open('/media/missing', '203.0.113.41')).status).toBe(404);
    expect((await open('/health/live', '203.0.113.40')).status).toBe(200);
    expect((await open('/media/missing')).status).toBe(404);
  });

  it('개발·테스트 모드에서는 제한하지 않아야 한다', async () => {
    api = await createTestApp({}, { trustProxy: 1 });
    for (let index = 0; index <= MEDIA_RATE_LIMIT_PER_WINDOW; index++) {
      const response = await open('/media/missing', '203.0.113.42');
      if (response.status !== 404) throw new Error(`${index + 1}번째 요청이 ${response.status}로 끝났다`);
    }
  });
});
