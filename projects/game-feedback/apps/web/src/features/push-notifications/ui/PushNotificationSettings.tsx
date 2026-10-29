'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { match, P } from 'ts-pattern';

import { Button } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { postToNative } from '@/shared/native';

import { enablePushMutationOptions } from '../model/push.mutation-options';
import { pushStatusOptions } from '../model/push.options';
import { useNativePushSupported } from '../model/use-native-push-supported';

export function PushNotificationSettings({ userId }: { userId: string }) {
  const supported = useNativePushSupported();
  return supported ? <NativePushSettings userId={userId} /> : null;
}

function NativePushSettings({ userId }: { userId: string }) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const { data: status } = useQuery(pushStatusOptions(userId, locale));
  const enable = useMutation(enablePushMutationOptions(client, userId, locale));
  const message = match(status)
    .with('unavailable', () => t('앱 알림을 준비하고 있어요. 잠시 후 다시 확인해 주세요.'))
    .with('granted', () => t('앱 알림이 켜져 있어요.'))
    .with('denied', () => t('기기 설정에서 알림을 허용해 주세요.'))
    .with(P.union('undetermined', undefined), () => t('새로운 소식을 앱 알림으로 받아보세요.'))
    .exhaustive();
  const actionLabel = match({ pending: enable.isPending, status })
    .with({ pending: true }, () => t('확인 중…'))
    .with({ status: 'denied' }, () => t('기기 설정 열기'))
    .with({ pending: false }, () => t('알림 켜기'))
    .exhaustive();
  const handleAction = () => {
    if (status === 'denied') {
      postToNative({ type: 'push-settings' });
      return;
    }
    enable.mutate();
  };
  return (
    <section className="info-card" aria-label={t('앱 알림')}>
      <strong>{t('앱 알림')}</strong>
      <p role="status">{message}</p>
      {status !== 'granted' && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={enable.isPending}
          onClick={handleAction}
        >
          {actionLabel}
        </Button>
      )}
      {enable.error && <p role="alert">{t('알림 설정에 실패했어요. 다시 시도해 주세요.')}</p>}
    </section>
  );
}
