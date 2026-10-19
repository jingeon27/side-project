'use client';
import { useI18n } from '@/shared/i18n';
import { RefreshCw, WifiOff } from 'lucide-react';
import { match } from 'ts-pattern';
import { useChatConnection } from '@/widgets/chat-realtime';

export function ChatConnectionStatus() {
  const { t } = useI18n();
  const connection = useChatConnection();
  if (connection === 'live') return null;
  const status = match(connection)
    .with('offline', () => ({ label: t('오프라인입니다. 연결을 기다려요'), icon: <WifiOff size={13} /> }))
    .otherwise(() => ({
      label: t('재연결 중입니다. 자동으로 새로고침해요'),
      icon: <RefreshCw size={12} className="spin" />,
    }));
  return (
    <div className={`chat-connection ${connection}`} role="status">
      {status.icon}
      <span>{status.label}</span>
    </div>
  );
}
