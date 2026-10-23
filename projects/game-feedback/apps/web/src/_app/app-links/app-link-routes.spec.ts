import { connection } from 'next/server';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { appleAppSiteAssociation, assetLinks } from './app-link-routes';

vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }));
const FINGERPRINT = Array.from({ length: 32 }, () => 'CD').join(':');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(connection).mockClear();
});

function stubProductionAppLinks() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('MOBILE_APPLE_TEAM_ID', 'ABCDE12345');
  vi.stubEnv('MOBILE_IOS_BUNDLE_ID', 'com.example.game');
  vi.stubEnv('MOBILE_ANDROID_PACKAGE', 'com.example.game');
  vi.stubEnv('MOBILE_ANDROID_SHA256_FINGERPRINTS', FINGERPRINT);
}

describe('/.well-known routes', () => {
  it('read deployment values at request time instead of build time', async () => {
    stubProductionAppLinks();
    const aasa = await appleAppSiteAssociation();
    expect(connection).toHaveBeenCalledOnce();
    expect(await aasa.json()).toEqual({
      applinks: {
        details: [{ appIDs: ['ABCDE12345.com.example.game'], components: [{ '/': '/app-auth/callback' }] }],
      },
      webcredentials: { apps: ['ABCDE12345.com.example.game'] },
    });
    const links = await assetLinks();
    expect((await links.json())[0].target).toEqual({
      namespace: 'android_app',
      package_name: 'com.example.game',
      sha256_cert_fingerprints: [FINGERPRINT],
    });
  });

  it('do not link any app when production values are missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MOBILE_APPLE_TEAM_ID', '');
    expect((await appleAppSiteAssociation()).status).toBe(404);
    expect((await assetLinks()).status).toBe(404);
  });
});
