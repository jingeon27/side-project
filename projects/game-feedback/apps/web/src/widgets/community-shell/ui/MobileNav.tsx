'use client';
import { useI18n } from '@/shared/i18n';
import { TabLink as Link } from '@/shared/navigation';
import { Home, MessageCircle, Bell, Settings2, CircleHelp, List } from 'lucide-react';
import { resolveAppRoute } from '@game-feedback/bridge';
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
        className={tab === 'feed' ? 'active' : ''}
        aria-current={tab === 'feed' ? 'page' : undefined}
      >
        <Home size={20} />
        <span>{t('라운지')}</span>
      </Link>
      <Link
        href={`${home}/boards/account-trade`}
        replace
        className={tab === 'boards' ? 'active' : ''}
        aria-current={tab === 'boards' ? 'page' : undefined}
      >
        <List size={20} />
        <span>{t('게시판')}</span>
      </Link>
      <Link
        href={`${home}/messages`}
        replace
        className={tab === 'messages' ? 'active' : ''}
        aria-current={tab === 'messages' ? 'page' : undefined}
      >
        <MessageCircle size={20} />
        <span>
          {t('채팅')}
          {chatUnread > 0 && (
            <span className="mobile-chat-count">({chatUnread > 99 ? '99+' : chatUnread})</span>
          )}
        </span>
      </Link>
      <Link
        href={`${home}/notifications`}
        replace
        className={tab === 'notifications' ? 'active' : ''}
        aria-current={tab === 'notifications' ? 'page' : undefined}
      >
        <Bell size={20} />
        <span>{t('알림')}</span>
      </Link>
      <Link
        href={`${home}/settings`}
        replace
        className={tab === 'settings' ? 'active' : ''}
        aria-current={tab === 'settings' ? 'page' : undefined}
      >
        <Settings2 size={20} />
        <span>{t('내 프로필')}</span>
      </Link>
      <Link
        href={`${home}/guide`}
        replace
        className={tab === 'guide' ? 'active' : ''}
        aria-current={tab === 'guide' ? 'page' : undefined}
      >
        <CircleHelp size={20} />
        <span>{t('가이드')}</span>
      </Link>
    </nav>
  );
}
