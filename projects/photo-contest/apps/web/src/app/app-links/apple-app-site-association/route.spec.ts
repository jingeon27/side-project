import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/.well-known/apple-app-site-association', () => {
  it('요청할 때의 배포 환경변수로 앱 로그인 콜백 경로만 앱에 연결해야 한다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MOBILE_APPLE_TEAM_ID', 'ABCDE12345');
    vi.stubEnv('MOBILE_IOS_BUNDLE_ID', 'com.example.contest');
    vi.stubEnv('MOBILE_ANDROID_PACKAGE', 'com.example.contest');
    vi.stubEnv('MOBILE_ANDROID_SHA256_FINGERPRINTS', Array.from({ length: 32 }, () => 'AB').join(':'));

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({
      applinks: {
        details: [
          { appIDs: ['ABCDE12345.com.example.contest'], components: [{ '/': '/app-auth/callback' }] },
        ],
      },
      webcredentials: { apps: ['ABCDE12345.com.example.contest'] },
    });
  });

  it('운영 값이 없으면 엉뚱한 앱을 연결하지 않게 404여야 한다', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MOBILE_APPLE_TEAM_ID', '');
    expect(GET().status).toBe(404);
  });
});
