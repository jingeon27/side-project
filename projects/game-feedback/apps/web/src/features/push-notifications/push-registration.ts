import { registerPushDevice, unregisterPushDevice } from '@game-feedback/sdk';

import type { TLocale } from '@/shared/i18n';
import { requestNativePush } from '@/shared/native';

export async function synchronizePush(requestPermission: boolean, locale: TLocale) {
  const registration = await requestNativePush(requestPermission);
  if (!registration) throw new Error('앱 알림 설정을 확인하지 못했어요.');
  const { installationId, token, platform, status } = registration;
  if (status === 'granted' && token) {
    const response = await registerPushDevice({ installationId, token, platform, locale });
    return response.enabled ? status : 'unavailable';
  }
  if (status === 'denied' || status === 'undetermined') await unregisterPushDevice({ installationId });
  return status;
}
