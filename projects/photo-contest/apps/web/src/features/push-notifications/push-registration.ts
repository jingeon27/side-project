import { z } from 'zod';

import type { IWebBridge } from '@photo-contest/bridge/web';

import { ensureOk } from '@/shared/model/error';

export async function synchronizePush(bridge: IWebBridge, requestPermission: boolean) {
  const registration = await bridge.request('notifications.registration', { requestPermission });
  const { installationId, platform, token, status } = registration;
  if (status === 'unavailable') return status;
  const granted = status === 'granted' && token;
  const response = await ensureOk(
    await fetch(`/backend/push/devices/${granted ? 'register' : 'unregister'}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(granted ? { installationId, token, platform, locale: 'ko' } : { installationId }),
    }),
  );
  if (granted) {
    const saved = z.object({ ok: z.literal(true), enabled: z.boolean() }).parse(await response.json());
    return saved.enabled ? status : 'unavailable';
  }
  return status;
}
