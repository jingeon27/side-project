import { describe, expect, it } from 'vitest';

import { resolveStoreUrl } from './store-url';

describe('store link', () => {
  it('uses the native Android package and does not invent an iOS App Store identifier', () => {
    expect(resolveStoreUrl({ platform: 'android', androidPackage: 'dev.side.photocontest' })).toBe(
      'market://details?id=dev.side.photocontest',
    );
    expect(resolveStoreUrl({ platform: 'android', androidPackage: 'bad package' })).toBeNull();
    expect(resolveStoreUrl({ platform: 'ios', androidPackage: null })).toBeNull();
  });
});
