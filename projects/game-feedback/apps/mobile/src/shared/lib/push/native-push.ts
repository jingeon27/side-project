import { Linking, Platform } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import type { TPushRegistration } from '@game-feedback/bridge';

const INSTALLATION_KEY = 'game-feedback:push-installation';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let installation: Promise<string> | undefined;
let registration: Promise<TPushRegistration> | undefined;

function projectId(): string | null {
  const value: unknown = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof value === 'string' && UUID.test(value) ? value : null;
}
export function supportsNativePush() {
  return Device.isDevice && (Platform.OS === 'ios' || Platform.OS === 'android') && !!projectId();
}
function installationId() {
  installation ??= AsyncStorage.getItem(INSTALLATION_KEY)
    .then(async (saved) => {
      if (saved && UUID.test(saved)) return saved;
      const id = randomUUID();
      await AsyncStorage.setItem(INSTALLATION_KEY, id);
      return id;
    })
    .catch((error: unknown) => {
      installation = undefined;
      throw error;
    });
  return installation;
}
async function register(requestPermission: boolean): Promise<TPushRegistration> {
  const id = await installationId();
  const base = {
    installationId: id,
    platform: Platform.OS === 'ios' ? ('ios' as const) : ('android' as const),
  };
  const project = projectId();
  if (!supportsNativePush() || !project) return { ...base, status: 'unavailable', token: null };
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('activity', {
      name: '활동 알림',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  let permission = await Notifications.getPermissionsAsync();
  if (requestPermission && !permission.granted && permission.canAskAgain)
    permission = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
  const granted =
    permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!granted)
    return { ...base, status: permission.status === 'denied' ? 'denied' : 'undetermined', token: null };
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: project })).data;
  return { ...base, status: 'granted', token };
}
/** 시스템 권한 창은 사용자가 켜기를 누른 요청에서만 연다. 세션 쿠키는 웹에 남긴다. */
export function getPushRegistration(requestPermission: boolean): Promise<TPushRegistration> {
  if (registration) return registration;
  registration = register(requestPermission).finally(() => {
    registration = undefined;
  });
  return registration;
}
export async function setPushBadge(count: number) {
  return { updated: await Notifications.setBadgeCountAsync(Math.min(9999, Math.max(0, Math.trunc(count)))) };
}
export async function openPushSettings() {
  await Linking.openSettings();
  return { opened: true };
}
