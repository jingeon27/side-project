import { z } from 'zod';

import type { IWebBridge } from '@photo-contest/bridge/web';

import { BACKEND_ROUTES } from '@/shared/constants/routes';
import { ensureOk } from '@/shared/model/error';

import type { TPushStatus } from '../model/push-status.type';

const savedDeviceSchema = z.object({ ok: z.literal(true), enabled: z.boolean() });

/**
 * 앱의 권한·토큰을 현재 세션의 기기 등록과 맞춘다. 권한이 있으면 등록하고 없으면 해제한다.
 * `requestPermission`이 true일 때만 OS 권한 창을 띄운다.
 */
export async function synchronizePush(bridge: IWebBridge, requestPermission: boolean): Promise<TPushStatus> {
  const { installationId, platform, token, status } = await bridge.request('notifications.registration', {
    requestPermission,
  });
  if (status === 'unavailable') return status;
  const granted = status === 'granted' && token;
  const response = await ensureOk(
    await fetch(granted ? BACKEND_ROUTES.PUSH_DEVICE_REGISTER : BACKEND_ROUTES.PUSH_DEVICE_UNREGISTER, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(granted ? { installationId, token, platform, locale: 'ko' } : { installationId }),
    }),
  );
  if (!granted) return status;
  const saved = savedDeviceSchema.parse(await response.json());
  return saved.enabled ? status : 'unavailable';
}
