import { describe, expect, it } from 'vitest';

import { resolveStoreUrl } from './store-url';

describe('resolveStoreUrl', () => {
  it('Android는 앱 패키지 이름으로 Play 스토어 주소를 만들어야 한다', () => {
    expect(
      resolveStoreUrl({ platform: 'android', androidPackage: 'dev.side.photocontest', iosAppStoreId: null }),
    ).toBe('market://details?id=dev.side.photocontest');
    expect(
      resolveStoreUrl({ platform: 'android', androidPackage: 'bad package', iosAppStoreId: null }),
    ).toBeNull();
  });

  it('iOS는 설정한 App Store 숫자 ID로 스토어 주소를 만들어야 한다', () => {
    expect(resolveStoreUrl({ platform: 'ios', androidPackage: null, iosAppStoreId: '1000000001' })).toBe(
      'https://apps.apple.com/app/id1000000001',
    );
  });

  it('iOS App Store ID가 없거나 숫자가 아니면 주소를 지어내지 않아야 한다', () => {
    for (const iosAppStoreId of [null, '', 'id1000000001', '1000000001/../evil'])
      expect(
        resolveStoreUrl({ platform: 'ios', androidPackage: 'dev.side.photocontest', iosAppStoreId }),
      ).toBeNull();
  });
});
