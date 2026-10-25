import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { resetFakeWebView } from './src/test/ui/fake-web-view';

vi.mock('react-native-webview', async () => ({
  default: (await import('./src/test/ui/fake-web-view')).FakeWebView,
}));
vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View };
});
vi.mock('expo-linking', () => ({
  getInitialURL: vi.fn(async () => null),
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
}));
vi.mock('expo-web-browser', () => ({ openAuthSessionAsync: vi.fn(async () => ({ type: 'cancel' })) }));
vi.mock('expo-crypto', () => ({
  getRandomBytes: vi.fn(() => new Uint8Array(32)),
  digestStringAsync: vi.fn(async () => 'a'.repeat(43)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}));
afterEach(() => {
  cleanup();
  resetFakeWebView();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

vi.mock('expo-device', () => ({ isDevice: false }));
vi.mock('expo-notifications', () => ({}));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { webOrigin: 'https://feedback.example' } } },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) },
}));
