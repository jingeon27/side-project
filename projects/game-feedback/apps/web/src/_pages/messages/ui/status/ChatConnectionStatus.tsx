'use client';

import { match, P } from 'ts-pattern';

import { StatusAnimation } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { useChatConnection } from '@/widgets/chat-realtime';

export function ChatConnectionStatus() {
  const { t } = useI18n();
  const connection = useChatConnection();
  if (connection === 'live') return null;
  const status = match(connection)
    .with('offline', () => ({
      label: t('오프라인입니다. 연결을 기다려요'),
      icon: <StatusAnimation variant="offline" className="size-4 text-current" />,
    }))
    .with(P.union('connecting', 'retrying'), () => ({
      label: t('재연결 중입니다. 자동으로 새로고침해요'),
      icon: <StatusAnimation variant="loading" className="size-4 text-current" />,
    }))
    .exhaustive();
  return (
    <div className="chat-connection" data-connection={connection} role="status">
      {status.icon}
      <span>{status.label}</span>
    </div>
  );
}
