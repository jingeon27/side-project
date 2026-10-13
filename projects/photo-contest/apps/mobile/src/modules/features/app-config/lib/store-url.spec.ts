import { describe, expect, it } from 'vitest';

import { resolveStoreUrl } from './store-url';

describe('resolveStoreUrl', () => {
  it('설정된 스토어 주소를 먼저 써야 한다', () => {
    expect(
      resolveStoreUrl({
        platform: 'ios',
        configuredUrl: ' itms-apps://apps.apple.com/app/id123 ',
        androidPackage: null,
      }),
    ).toBe('itms-apps://apps.apple.com/app/id123');
    expect(
      resolveStoreUrl({
        platform: 'android',
        configuredUrl: 'https://play.google.com/store/apps/details?id=dev.side.photocontest',
        androidPackage: 'dev.side.photocontest',
      }),
    ).toBe('https://play.google.com/store/apps/details?id=dev.side.photocontest');
  });

  it('설정이 없으면 Android는 패키지 이름으로 스토어 주소를 만들어야 한다', () => {
    expect(
      resolveStoreUrl({
        platform: 'android',
        configuredUrl: undefined,
        androidPackage: 'dev.side.photocontest',
      }),
    ).toBe('market://details?id=dev.side.photocontest');
  });

  it('iOS에 설정이 없거나 값이 안전하지 않으면 null이어야 한다', () => {
    expect(
      resolveStoreUrl({ platform: 'ios', configuredUrl: '', androidPackage: 'dev.side.photocontest' }),
    ).toBeNull();
    expect(
      resolveStoreUrl({ platform: 'ios', configuredUrl: 'javascript:alert(1)', androidPackage: null }),
    ).toBeNull();
    expect(
      resolveStoreUrl({
        platform: 'android',
        configuredUrl: 'http://store.example',
        androidPackage: 'bad package',
      }),
    ).toBeNull();
  });
});
