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
      'photo-contest:push-installation',
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
  it('동시 등록 요청은 권한 확인과 설치 ID 생성 결과를 공유해야 한다', async () => {
    const permission = Promise.withResolvers<Notifications.NotificationPermissionsStatus>();
    vi.mocked(Notifications.getPermissionsAsync).mockReturnValueOnce(permission.promise);
    const { getPushRegistration } = await import('./native-push');
    const first = getPushRegistration(true);
    expect(getPushRegistration(false)).toBe(first);
    permission.resolve({
      status: 'undetermined',
      granted: false,
      canAskAgain: true,
      expires: 'never',
    } as Notifications.NotificationPermissionsStatus);
    expect(await first).toMatchObject({ installationId, status: 'granted' });
    expect(AsyncStorage.setItem).toHaveBeenCalledOnce();
    expect(Notifications.getPermissionsAsync).toHaveBeenCalledOnce();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledOnce();
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledOnce();
  });
  it('설치 ID 조회 실패 후 다음 등록에서 저장소를 다시 읽어야 한다', async () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('설치 ID 조회 실패'));
    const { getPushRegistration } = await import('./native-push');
    await expect(getPushRegistration(true)).rejects.toThrow('설치 ID 조회 실패');
    expect(await getPushRegistration(true)).toMatchObject({ installationId, status: 'granted' });
    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(2);
    expect(AsyncStorage.setItem).toHaveBeenCalledOnce();
  });
  it('저장소가 동기 예외를 던져도 실패한 초기화를 캐시하지 않고 재시도해야 한다', async () => {
    vi.mocked(AsyncStorage.getItem).mockImplementationOnce(() => {
      throw new Error('native storage missing');
    });
    const { getPushRegistration } = await import('./native-push');
    await expect(getPushRegistration(true)).rejects.toThrow('native storage missing');
    expect(await getPushRegistration(true)).toMatchObject({ installationId, status: 'granted' });
    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(2);
  });
  it('토큰 조회 실패 후 등록은 다시 시도하고 설치 ID는 유지해야 한다', async () => {
    vi.mocked(Notifications.getExpoPushTokenAsync).mockRejectedValueOnce(new Error('푸시 토큰 조회 실패'));
    const { getPushRegistration } = await import('./native-push');
    await expect(getPushRegistration(true)).rejects.toThrow('푸시 토큰 조회 실패');
    expect(await getPushRegistration(true)).toMatchObject({ installationId, status: 'granted' });
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(2);
    expect(AsyncStorage.getItem).toHaveBeenCalledOnce();
    expect(AsyncStorage.setItem).toHaveBeenCalledOnce();
  });
});
