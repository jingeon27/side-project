'use client';

import { useEffect, useState } from 'react';

import { useBridge, useNativeApp } from '@/shared/model/bridge';
import { Button } from '@/shared/ui/@core/button';

import { synchronizePush } from '../lib/push-registration.helper';

export function PushNotificationSettings() {
  const bridge = useBridge();
  const app = useNativeApp();
  const supported = !!app && !!bridge?.supports('notifications.registration');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!bridge || !supported) return;
    let active = true;
    void synchronizePush(bridge, false)
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [bridge, supported]);
  if (!supported || !bridge) return null;
  return (
    <section
      aria-label="앱 알림"
      className="flex flex-col items-start gap-3 rounded-xl border border-line p-4"
    >
      <h2 className="text-body font-semibold">앱 알림</h2>
      <p role="status" className="text-caption text-muted">
        {status === 'unavailable'
          ? '앱 알림을 준비하고 있어요. 잠시 후 다시 확인해 주세요.'
          : status === 'granted'
            ? '앱 알림이 켜져 있어요.'
            : status === 'denied'
              ? '기기 설정에서 알림을 허용해 주세요.'
              : '새로운 소식을 앱 알림으로 받아보세요.'}
      </p>
      {status !== 'granted' && (
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setFailed(false);
            try {
              if (status === 'denied' && bridge.supports('notifications.settings')) {
                await bridge.request('notifications.settings', {});
                return;
              }
              setStatus(await synchronizePush(bridge, true));
            } catch {
              setFailed(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {status === 'denied' ? '기기 설정 열기' : '알림 켜기'}
        </Button>
      )}
      {failed && (
        <p role="alert" className="text-caption text-danger">
          알림 설정에 실패했어요. 다시 시도해 주세요.
        </p>
      )}
    </section>
  );
}
