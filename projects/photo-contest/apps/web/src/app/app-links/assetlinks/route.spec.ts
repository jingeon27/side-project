import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const FINGERPRINT = Array.from({ length: 32 }, () => 'CD').join(':');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/.well-known/assetlinks.json', () => {
  it('요청할 때의 배포 환경변수로 패키지와 서명 지문을 연결해야 한다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MOBILE_APPLE_TEAM_ID', 'ABCDE12345');
    vi.stubEnv('MOBILE_IOS_BUNDLE_ID', 'com.example.contest');
    vi.stubEnv('MOBILE_ANDROID_PACKAGE', 'com.example.contest');
    vi.stubEnv('MOBILE_ANDROID_SHA256_FINGERPRINTS', FINGERPRINT);

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.example.contest',
          sha256_cert_fingerprints: [FINGERPRINT],
        },
      },
    ]);
  });

  it('운영 값이 없으면 404여야 한다', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MOBILE_ANDROID_SHA256_FINGERPRINTS', '');
    expect(GET().status).toBe(404);
  });
});
