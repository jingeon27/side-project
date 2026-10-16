import { TabLink as Link } from '@/shared/navigation';
import { Home, MessageCircle, Bell, Settings2, CircleHelp } from 'lucide-react';
import { resolveAppRoute } from '@game-feedback/bridge';
interface IMobileNavProps {
  home: string;
  path: string;
  chatUnread: number;
}
export function MobileNav({ home, path, chatUnread }: IMobileNavProps) {
  const tab = resolveAppRoute(path)?.tab;
  return (
    <nav className="mobile-nav" aria-label="모바일 메뉴">
      <Link
        href={home}
        replace
        className={tab === 'feed' ? 'active' : ''}
        aria-current={tab === 'feed' ? 'page' : undefined}
      >
        <Home size={20} />
        <span>라운지</span>
      </Link>
      <Link
        href={`${home}/messages`}
        replace
        className={tab === 'messages' ? 'active' : ''}
        aria-current={tab === 'messages' ? 'page' : undefined}
      >
        <MessageCircle size={20} />
        <span>채팅{chatUnread > 0 && <span className="mobile-chat-dot" />}</span>
      </Link>
      <Link
        href={`${home}/notifications`}
        replace
        className={tab === 'notifications' ? 'active' : ''}
        aria-current={tab === 'notifications' ? 'page' : undefined}
      >
        <Bell size={20} />
        <span>알림</span>
      </Link>
      <Link
        href={`${home}/settings`}
        replace
        className={tab === 'settings' ? 'active' : ''}
        aria-current={tab === 'settings' ? 'page' : undefined}
      >
        <Settings2 size={20} />
        <span>내 프로필</span>
      </Link>
      <Link
        href={`${home}/guide`}
        replace
        className={tab === 'guide' ? 'active' : ''}
        aria-current={tab === 'guide' ? 'page' : undefined}
      >
        <CircleHelp size={20} />
        <span>가이드</span>
      </Link>
    </nav>
  );
}
