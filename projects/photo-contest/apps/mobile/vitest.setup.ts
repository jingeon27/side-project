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

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) },
}));

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

// ui 프로젝트는 DSN·분석 키를 넣고 돈다. 네이티브 SDK 대신 호출을 기록해 화면이 무엇을 남기는지 검증한다.
vi.mock('@sentry/react-native', () => ({
  init: vi.fn(),
  wrap: vi.fn((component: unknown) => component),
  captureMessage: vi.fn(() => 'event-id'),
  captureException: vi.fn(() => 'event-id'),
}));

vi.mock('@amplitude/analytics-react-native', () => ({
  init: vi.fn(() => ({ promise: Promise.resolve() })),
  track: vi.fn(() => ({ promise: Promise.resolve() })),
  getDeviceId: vi.fn(() => 'amplitude-device-1'),
  getUserId: vi.fn(() => undefined),
  setUserId: vi.fn(),
  reset: vi.fn(),
}));

afterEach(() => {
  cleanup();
  resetFakeWebView();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});
