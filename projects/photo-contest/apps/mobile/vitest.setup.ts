import { createHash, webcrypto } from 'node:crypto';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { resetFakeWebView } from './src/test/ui/fake-web-view';

// ui 프로젝트는 react-native를 react-native-web으로 바꿔 그린다. 네이티브 모듈은 여기서 기록용 대역으로 바꾼다.
vi.mock('react-native-webview', async () => {
  const { FakeWebView } = await import('./src/test/ui/fake-web-view');
  return { default: FakeWebView, WebView: FakeWebView };
});

vi.mock('react-native-safe-area-context', async () => {
  const { FakeSafeAreaProvider, FakeSafeAreaView } = await import('./src/test/ui/native-module-fakes');
  return { SafeAreaProvider: FakeSafeAreaProvider, SafeAreaView: FakeSafeAreaView };
});

vi.mock('expo-status-bar', async () => {
  const { FakeStatusBar } = await import('./src/test/ui/native-module-fakes');
  return { StatusBar: FakeStatusBar };
});

vi.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: vi.fn(async () => true),
  hideAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-linking', () => ({
  getInitialURL: vi.fn(async () => null),
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  openURL: vi.fn(async () => true),
}));

vi.mock('expo-clipboard', () => ({
  setStringAsync: vi.fn(async () => true),
}));

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  impactAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-web-browser', () => ({
  openBrowserAsync: vi.fn(async () => ({ type: 'opened' })),
  openAuthSessionAsync: vi.fn(async () => ({ type: 'cancel' })),
}));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomValues: vi.fn(<T extends Uint8Array>(array: T) => webcrypto.getRandomValues(array)),
  digest: vi.fn(async (_algorithm: string, data: Uint8Array) => {
    const hash = createHash('sha256').update(data).digest();
    return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
  }),
}));

vi.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  applicationId: 'dev.side.photocontest',
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}));

afterEach(() => {
  cleanup();
  resetFakeWebView();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});
