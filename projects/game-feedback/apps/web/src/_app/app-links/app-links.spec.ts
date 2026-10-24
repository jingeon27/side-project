import { describe, expect, it } from 'vitest';

import {
  appLinksResponse,
  assertAppLinksConfig,
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  readAppLinksConfig,
} from './app-links';

const FINGERPRINT = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0')).join(':');
const PRODUCTION_ENV = {
  NODE_ENV: 'production',
  MOBILE_APPLE_TEAM_ID: 'ABCDE12345',
  MOBILE_IOS_BUNDLE_ID: 'com.example.game',
  MOBILE_ANDROID_PACKAGE: 'com.example.game',
  MOBILE_ANDROID_SHA256_FINGERPRINTS: ` ${FINGERPRINT} , ${FINGERPRINT.toUpperCase()},${'AB:'.repeat(31)}AB`,
};
const CONFIG = {
  iosAppId: 'ABCDE12345.com.example.game',
  androidPackage: 'com.example.game',
  androidFingerprints: [FINGERPRINT.toUpperCase(), `${'AB:'.repeat(31)}AB`],
};

describe('app link settings', () => {
  it('builds the iOS app ID and deduplicated upper-case Android fingerprints from production settings', () => {
    expect(readAppLinksConfig(PRODUCTION_ENV)).toEqual({ ok: true, config: CONFIG });
  });

  it('reports every missing production value instead of using placeholders', () => {
    expect(readAppLinksConfig({ NODE_ENV: 'production' })).toEqual({
      ok: false,
      invalid: [
        'MOBILE_APPLE_TEAM_ID',
        'MOBILE_IOS_BUNDLE_ID',
        'MOBILE_ANDROID_PACKAGE',
        'MOBILE_ANDROID_SHA256_FINGERPRINTS',
      ],
    });
    expect(() => assertAppLinksConfig({ ...PRODUCTION_ENV, MOBILE_IOS_BUNDLE_ID: '' })).toThrow(
      /MOBILE_IOS_BUNDLE_ID/,
    );
    expect(() => assertAppLinksConfig(PRODUCTION_ENV)).not.toThrow();
  });

  it.each([
    ['MOBILE_APPLE_TEAM_ID', 'abcde12345'],
    ['MOBILE_APPLE_TEAM_ID', 'ABCDE1234'],
    ['MOBILE_IOS_BUNDLE_ID', 'game'],
    ['MOBILE_IOS_BUNDLE_ID', 'com.example/game'],
    ['MOBILE_ANDROID_PACKAGE', 'com.example.1game'],
    ['MOBILE_ANDROID_PACKAGE', 'com.example-game.app'],
    ['MOBILE_ANDROID_SHA256_FINGERPRINTS', FINGERPRINT.replaceAll(':', '')],
    ['MOBILE_ANDROID_SHA256_FINGERPRINTS', `${FINGERPRINT}:00`],
    ['MOBILE_ANDROID_SHA256_FINGERPRINTS', ','],
  ])('rejects a malformed %s in every environment: %s', (name, value) => {
    for (const NODE_ENV of ['production', 'development'])
      expect(readAppLinksConfig({ ...PRODUCTION_ENV, NODE_ENV, [name]: value })).toEqual({
        ok: false,
        invalid: [name],
      });
  });

  it('fills empty development values with obvious placeholders', () => {
    expect(readAppLinksConfig({ NODE_ENV: 'development', MOBILE_APPLE_TEAM_ID: ' ' })).toEqual({
      ok: true,
      config: {
        iosAppId: 'TEAMID0000.dev.side.gamefeedback',
        androidPackage: 'dev.side.gamefeedback',
        androidFingerprints: [Array.from({ length: 32 }, () => '00').join(':')],
      },
    });
    expect(() => assertAppLinksConfig({ NODE_ENV: 'test' })).not.toThrow();
  });
});

describe('verification files', () => {
  it('opens only the app login callback as a Universal Link and lists the same app for webcredentials', () => {
    expect(buildAppleAppSiteAssociation(CONFIG)).toEqual({
      applinks: { details: [{ appIDs: [CONFIG.iosAppId], components: [{ '/': '/app-auth/callback' }] }] },
      webcredentials: { apps: [CONFIG.iosAppId] },
    });
  });

  it('links the package and signing fingerprints with handle_all_urls', () => {
    expect(buildAssetLinks(CONFIG)).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: CONFIG.androidPackage,
          sha256_cert_fingerprints: CONFIG.androidFingerprints,
        },
      },
    ]);
  });

  it('answers JSON for valid settings and an empty 404 otherwise', async () => {
    const ok = appLinksResponse(PRODUCTION_ENV, buildAssetLinks);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('application/json');
    expect(ok.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(await ok.json()).toEqual(buildAssetLinks(CONFIG));
    const missing = appLinksResponse({ NODE_ENV: 'production' }, buildAppleAppSiteAssociation);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('no-store');
    expect(await missing.text()).toBe('');
  });
});
