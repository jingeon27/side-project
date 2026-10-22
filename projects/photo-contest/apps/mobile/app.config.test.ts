import type { ConfigContext } from 'expo/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import appConfig from './app.config';

const resolve = () => appConfig({ config: {} } as ConfigContext);

afterEach(() => vi.unstubAllEnvs());

describe('app.config 빌드 설정', () => {
  it('운영 빌드는 웹 origin이 없거나 https가 아니면 설정 단계에서 멈춰야 한다', () => {
    vi.stubEnv('APP_VARIANT', '');
    vi.stubEnv('EXPO_PUBLIC_WEB_ORIGIN', '');
    expect(resolve).toThrow('EXPO_PUBLIC_WEB_ORIGIN');
    vi.stubEnv('EXPO_PUBLIC_WEB_ORIGIN', 'http://contest.example');
    expect(resolve).toThrow('https');
  });

  it('운영 빌드는 https origin만 담고 로컬 네트워크·평문 예외를 두지 않아야 한다', () => {
    vi.stubEnv('APP_VARIANT', '');
    vi.stubEnv('EXPO_PUBLIC_WEB_ORIGIN', 'https://Contest.Example/');
    const config = resolve();
    expect(config.extra).toEqual({ webOrigin: 'https://contest.example' });
    expect(config.ios?.infoPlist).not.toHaveProperty('NSAppTransportSecurity');
    expect(config.plugins).toContainEqual(['expo-build-properties', { android: {} }]);
  });

  it('Android 자동 백업으로 WebView 세션 쿠키가 기기 밖에 복사되지 않아야 한다', () => {
    vi.stubEnv('APP_VARIANT', '');
    vi.stubEnv('EXPO_PUBLIC_WEB_ORIGIN', 'https://contest.example');
    expect(resolve().android?.allowBackup).toBe(false);
  });

  it('개발 빌드만 localhost 기본값과 로컬 네트워크·평문 예외를 써야 한다', () => {
    vi.stubEnv('APP_VARIANT', 'development');
    vi.stubEnv('EXPO_PUBLIC_WEB_ORIGIN', '');
    const config = resolve();
    expect(config.extra).toEqual({ webOrigin: 'http://localhost:3200' });
    expect(config.ios?.infoPlist).toMatchObject({
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    });
    expect(config.plugins).toContainEqual([
      'expo-build-properties',
      { android: { usesCleartextTraffic: true } },
    ]);
  });
});
