import { TabLink as Link } from '@/shared/navigation';
import { MessageSquareText, ChevronRight, Bell, MessageCircle, Crown } from 'lucide-react';
import { resolveAppRoute } from '@game-feedback/bridge';
interface ILeftSidebarProps {
  home: string;
  path: string;
  unread: number;
  chatUnread: number;
}
export function LeftSidebar({ home, path, unread, chatUnread }: ILeftSidebarProps) {
  const tab = resolveAppRoute(path)?.tab;
  return (
    <aside className="left-sidebar">
      <div className="sidebar-label">둘러보기</div>
      <Link className={`side-link ${tab === 'feed' ? 'selected' : ''}`} href={home} replace>
        <MessageSquareText size={19} />
        전체 피드백
        <ChevronRight size={16} />
      </Link>
      <Link
        className={`side-link ${tab === 'notifications' ? 'selected' : ''}`}
        replace
        href={`${home}/notifications`}
      >
        <Bell size={19} />내 알림{unread > 0 && <span className="count-badge">{unread}</span>}
      </Link>
      <Link className={`side-link ${tab === 'messages' ? 'selected' : ''}`} href={`${home}/messages`} replace>
        <MessageCircle size={19} />
        채팅{chatUnread > 0 && <span className="count-badge">{chatUnread}</span>}
      </Link>
      <div className="sidebar-separator" />
      <div className="sidebar-label">나의 게임</div>
      <Link className="game-side-link" href={home}>
        <span className="game-icon">
          <Crown size={23} />
        </span>
        <span>
          <strong>클래시 로얄</strong>
          <small>Clash Royale</small>
        </span>
        <span className="live-dot" />
      </Link>
      <div className="upcoming-games">
        <span>다음 게임을 기다리고 있나요?</span>
        <span>더 많은 게임이 찾아올 예정이에요.</span>
      </div>
      <div className="sidebar-bottom">
        <div className="community-caption">
          <span className="tiny-sparkle">✳</span>
          <strong>
            좋은 피드백이
            <br />
            다음 플레이를 만듭니다.
          </strong>
        </div>
        <p>경험을 나누고, 함께 성장해요.</p>
        <div className="sidebar-footer-links">
          <Link href={`${home}/terms`}>이용약관</Link>
          <Link href={`${home}/privacy`}>개인정보</Link>
          <Link href={`${home}/contact`}>문의</Link>
        </div>
        <span className="copyright">© 2026 PLAYMATE</span>
      </div>
    </aside>
  );
}
