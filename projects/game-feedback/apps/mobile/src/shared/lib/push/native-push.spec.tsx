import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const installationId = '11111111-1111-4111-8111-111111111111';
vi.mock('react-native', async () => ({
  ...(await vi.importActual('react-native')),
  Platform: { OS: 'android' },
  Linking: { openSettings: vi.fn(async () => undefined) },
}));
vi.mock('expo-device', () => ({ isDevice: true }));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { eas: { projectId: '22222222-2222-4222-8222-222222222222' } } } },
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
vi.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  setNotificationChannelAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  setBadgeCountAsync: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  Constants.expoConfig!.extra!.eas.projectId = '22222222-2222-4222-8222-222222222222';
  vi.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  vi.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
  vi.mocked(Notifications.setNotificationChannelAsync).mockResolvedValue(null);
  vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    status: 'undetermined',
    granted: false,
    canAskAgain: true,
    expires: 'never',
  } as Notifications.NotificationPermissionsStatus);
  vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  } as Notifications.NotificationPermissionsStatus);
  vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
    type: 'expo',
    data: 'ExpoPushToken[aaaaaaaaaaaaaaaaaaaa]',
  });
});

describe('OS 푸시 등록', () => {
  it('백그라운드 동기화는 권한을 묻지 않고 사용자 요청에서만 묻고 설치 ID를 재사용해야 한다', async () => {
    const { getPushRegistration } = await import('./native-push');
    expect(await getPushRegistration(false)).toMatchObject({
      installationId,
      status: 'undetermined',
      token: null,
    });
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(await getPushRegistration(true)).toMatchObject({
      installationId,
      status: 'granted',
      token: expect.stringContaining('ExpoPushToken['),
    });
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledOnce();
    expect(AsyncStorage.setItem).toHaveBeenCalledExactlyOnceWith(
      'game-feedback:push-installation',
      installationId,
    );
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledBefore(
      vi.mocked(Notifications.getExpoPushTokenAsync),
    );
  });
  it('설정이 없거나 영구 거절된 경우 토큰을 요청하지 않아야 한다', async () => {
    delete Constants.expoConfig!.extra!.eas.projectId;
    const { getPushRegistration } = await import('./native-push');
    expect(await getPushRegistration(true)).toMatchObject({ status: 'unavailable', token: null });
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    Constants.expoConfig!.extra!.eas.projectId = '22222222-2222-4222-8222-222222222222';
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
    } as Notifications.NotificationPermissionsStatus);
    expect(await getPushRegistration(true)).toMatchObject({ status: 'denied', token: null });
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });
});
