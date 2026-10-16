import { RefreshCw, WifiOff } from 'lucide-react';
import { match } from 'ts-pattern';
import { useChatConnection } from '@/widgets/chat-realtime';

export function ChatConnectionStatus() {
  const connection = useChatConnection();
  const status = match(connection)
    .with('live', () => ({ label: '실시간 연결됨', icon: <span className="green-dot" /> }))
    .with('offline', () => ({ label: '오프라인 · 연결을 기다려요', icon: <WifiOff size={13} /> }))
    .otherwise(() => ({
      label: '재연결 중 · 자동으로 새로고침해요',
      icon: <RefreshCw size={12} className="spin" />,
    }));
  return (
    <div className={`chat-connection ${connection}`} role="status">
      {status.icon}
      <span>{status.label}</span>
    </div>
  );
}
