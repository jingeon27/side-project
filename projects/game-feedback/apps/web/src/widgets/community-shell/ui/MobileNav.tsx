'use client';

import { Home, MessageCircle, UserRound } from 'lucide-react';

import { resolveAppRoute } from '@game-feedback/bridge';

import { useI18n } from '@/shared/i18n';
import { TabLink as Link } from '@/shared/navigation';

interface IMobileNavProps {
  home: string;
  path: string;
  chatUnread: number;
}
export function MobileNav({ home, path, chatUnread }: IMobileNavProps) {
  const { t } = useI18n();
  const tab = resolveAppRoute(path)?.tab;
  return (
    <nav className="mobile-nav" aria-label={t('모바일 메뉴')}>
      <Link
        href={home}
        replace
        className={tab === 'feed' || tab === 'boards' ? 'active' : ''}
        aria-current={tab === 'feed' || tab === 'boards' ? 'page' : undefined}
      >
        <Home size={20} />
        <span>{t('홈')}</span>
      </Link>
      <Link
        href={`${home}/messages`}
        replace
        className={tab === 'messages' ? 'active' : ''}
        aria-current={tab === 'messages' ? 'page' : undefined}
        aria-label={chatUnread > 0 ? t('채팅 {count}개', { count: chatUnread }) : t('채팅')}
      >
        <span className="mobile-nav-icon" aria-hidden="true">
          <MessageCircle size={20} />
          {chatUnread > 0 && (
            <span className="mobile-chat-count">{chatUnread > 99 ? '99+' : chatUnread}</span>
          )}
        </span>
        <span>{t('채팅')}</span>
      </Link>
      <Link
        href={`${home}/settings`}
        replace
        className={tab === 'settings' ? 'active' : ''}
        aria-current={tab === 'settings' ? 'page' : undefined}
      >
        <UserRound size={20} />
        <span>{t('프로필')}</span>
      </Link>
    </nav>
  );
}
