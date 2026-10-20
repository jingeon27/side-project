import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp } from '../../test/support/app';
import type { ITestApi } from '../../test/support/app';

const NO_STORE = 'private, no-store';
// 아무도 듣지 않는 포트. 앱은 DB에 미리 연결하지 않으므로 뜨기는 하고 /health만 실패한다.
const OFFLINE_DATABASE_URL =
  'postgresql://offline:offline@127.0.0.1:1/offline?schema=public&connect_timeout=2';

describe('상태 확인과 앱 설정', () => {
  let api: ITestApi;

  beforeAll(async () => {
    api = await createTestApp();
  });

  afterAll(async () => {
    await api?.close();
  });

  it('GET /health는 DB에 닿으면 200 ok와 no-store를 돌려줘야 한다', async () => {
    const response = await api.http().get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe(NO_STORE);
  });

  it('GET /health는 DB에 닿지 않으면 503 unavailable이어야 한다', async () => {
    const offline = await createTestApp({ DATABASE_URL: OFFLINE_DATABASE_URL });
    try {
      const response = await offline.http().get('/health');
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ status: 'unavailable' });
      expect(response.headers['cache-control']).toBe(NO_STORE);
    } finally {
      await offline.close();
    }
  });

  it('GET /app/config는 설정이 없으면 최소·최신 버전 모두 1.0.0이어야 한다', async () => {
    const response = await api.http().get('/app/config');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ minimumVersion: '1.0.0', latestVersion: '1.0.0' });
    expect(response.headers['cache-control']).toBe(NO_STORE);
  });

  it('GET /app/config는 설정한 버전을 요청마다 읽고 최신 버전이 없으면 최소 버전을 써야 한다', async () => {
    vi.stubEnv('MOBILE_MINIMUM_VERSION', '1.2.0');
    expect((await api.http().get('/app/config')).body).toEqual({
      minimumVersion: '1.2.0',
      latestVersion: '1.2.0',
    });
    vi.stubEnv('MOBILE_LATEST_VERSION', '1.4.2');
    expect((await api.http().get('/app/config')).body).toEqual({
      minimumVersion: '1.2.0',
      latestVersion: '1.4.2',
    });
  });

  it('GET /app/config는 x.y.z가 아닌 값을 기본값으로, 최소보다 낮은 최신 버전을 최소 버전으로 바꿔야 한다', async () => {
    vi.stubEnv('MOBILE_MINIMUM_VERSION', 'v2');
    vi.stubEnv('MOBILE_LATEST_VERSION', '1.0.0-beta');
    expect((await api.http().get('/app/config')).body).toEqual({
      minimumVersion: '1.0.0',
      latestVersion: '1.0.0',
    });
    vi.stubEnv('MOBILE_MINIMUM_VERSION', '2.0.0');
    vi.stubEnv('MOBILE_LATEST_VERSION', '1.9.9');
    expect((await api.http().get('/app/config')).body).toEqual({
      minimumVersion: '2.0.0',
      latestVersion: '2.0.0',
    });
  });
});
