import Link from 'next/link';
import { Home, MessageCircle, Bell, Settings2, CircleHelp } from 'lucide-react';
interface IMobileNavProps {
  home: string;
  path: string;
  chatUnread: number;
}
export function MobileNav({ home, path, chatUnread }: IMobileNavProps) {
  const isHome = path === home;
  return (
    <nav className="mobile-nav" aria-label="모바일 메뉴">
      <Link href={home} className={isHome ? 'active' : ''}>
        <Home size={20} />
        <span>라운지</span>
      </Link>
      <Link href={`${home}/messages`} className={path.endsWith('/messages') ? 'active' : ''}>
        <MessageCircle size={20} />
        <span>채팅{chatUnread > 0 && <span className="mobile-chat-dot" />}</span>
      </Link>
      <Link href={`${home}/notifications`}>
        <Bell size={20} />
        <span>알림</span>
      </Link>
      <Link href={`${home}/settings`}>
        <Settings2 size={20} />
        <span>내 프로필</span>
      </Link>
      <Link href={`${home}/guide`}>
        <CircleHelp size={20} />
        <span>가이드</span>
      </Link>
    </nav>
  );
}
