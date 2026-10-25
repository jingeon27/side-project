import { describe, expect, inject, it } from 'vitest';

import { isUpdateRequired } from '../lib/version.helper';
import { fetchAppConfig, fetchHealth } from './app-config.api';

const apiUrl = inject('apiUrl');

describe('앱 시작 때 부르는 API', () => {
  it('GET /app/config 응답이 앱의 스키마를 통과하고 버전 검사에 쓸 수 있어야 한다', async () => {
    const config = await fetchAppConfig(apiUrl, fetch);

    expect(config).toEqual({ minimumVersion: '1.0.0', latestVersion: '1.0.0' });
    expect(isUpdateRequired('1.0.0', config.minimumVersion)).toBe(false);
    expect(isUpdateRequired('0.9.9', config.minimumVersion)).toBe(true);
  });

  it('GET /app/config는 캐시되지 않아야 한다', async () => {
    const response = await fetch(`${apiUrl}/app/config`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('GET /health 응답이 앱의 스키마를 통과해야 한다', async () => {
    await expect(fetchHealth(apiUrl, fetch)).resolves.toEqual({ status: 'ok' });
  });
});
