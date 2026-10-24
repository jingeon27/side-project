'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import { useMutation } from '@tanstack/react-query';

import { Button } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { NATIVE_BOOTSTRAP_EVENT, postToNative, supportsNativePush } from '@/shared/native';

import { synchronizePush } from './push-registration';

const subscribe = (listener: () => void) => {
  window.addEventListener(NATIVE_BOOTSTRAP_EVENT, listener);
  return () => window.removeEventListener(NATIVE_BOOTSTRAP_EVENT, listener);
};
export function useNativePushSupported() {
  return useSyncExternalStore(subscribe, supportsNativePush, () => false);
}
export function PushNotificationSettings() {
  const supported = useNativePushSupported();
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<string | null>(null);
  const { mutate, isPending, error } = useMutation({
    mutationFn: () => synchronizePush(true, locale),
    onSuccess: setStatus,
  });
  useEffect(() => {
    if (!supported) return;
    let active = true;
    void synchronizePush(false, locale)
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [supported, locale]);
  if (!supported) return null;
  return (
    <section className="info-card" aria-label={t('앱 알림')}>
      <strong>{t('앱 알림')}</strong>
      <p role="status">
        {status === 'unavailable'
          ? t('앱 알림을 준비하고 있어요. 잠시 후 다시 확인해 주세요.')
          : status === 'granted'
            ? t('앱 알림이 켜져 있어요.')
            : status === 'denied'
              ? t('기기 설정에서 알림을 허용해 주세요.')
              : t('새로운 소식을 앱 알림으로 받아보세요.')}
      </p>
      {status !== 'granted' && (
        <Button
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => {
            if (status === 'denied') {
              postToNative({ type: 'push-settings' });
              return;
            }
            mutate();
          }}
        >
          {isPending ? t('확인 중…') : status === 'denied' ? t('기기 설정 열기') : t('알림 켜기')}
        </Button>
      )}
      {error && <p role="alert">{t('알림 설정에 실패했어요. 다시 시도해 주세요.')}</p>}
    </section>
  );
}
