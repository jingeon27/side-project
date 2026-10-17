'use client';
import { useI18n } from '@/shared/i18n';
import { TabLink as Link } from '@/shared/navigation';
import { Bell, MessageCircle } from 'lucide-react';
import { ClashRoyaleIcon } from '@/features/game-profile';
import { activeGameBoard, clashRoyaleBoards, gameBoardPath } from '@/features/board';
import { resolveAppRoute } from '@game-feedback/bridge';
interface ILeftSidebarProps {
  home: string;
  path: string;
  unread: number;
  chatUnread: number;
}
export function LeftSidebar({ home, path, unread, chatUnread }: ILeftSidebarProps) {
  const { t } = useI18n();
  const tab = resolveAppRoute(path)?.tab;
  const selected = activeGameBoard(path);
  const locale = home.slice(1);
  return (
    <aside className="left-sidebar">
      <div className="sidebar-label">{t('둘러보기')}</div>
      <Link
        className={`side-link ${tab === 'notifications' ? 'selected' : ''}`}
        replace
        href={`${home}/notifications`}
      >
        <Bell size={19} />
        {t('내 알림')}
        {unread > 0 && <span className="count-badge">{unread}</span>}
      </Link>
      <Link className={`side-link ${tab === 'messages' ? 'selected' : ''}`} href={`${home}/messages`} replace>
        <MessageCircle size={19} />
        {t('채팅')}
        {chatUnread > 0 && <span className="count-badge">{chatUnread}</span>}
      </Link>
      <div className="sidebar-separator" />
      <div className="sidebar-label">{t('나의 게임')}</div>
      <nav aria-label={t('클래시 로얄 게시판')}>
        <Link className="game-side-link" href={home}>
          <ClashRoyaleIcon className="game-icon" size={40} />
          <span>
            <strong>{t('클래시 로얄')}</strong>
            <small>Clash Royale</small>
          </span>
        </Link>
        <div className="game-submenu">
          {clashRoyaleBoards.map((board) => (
            <Link
              key={board.kind}
              href={gameBoardPath(locale, board.kind)}
              replace
              className={`side-link ${selected === board.kind ? 'selected' : ''}`}
              aria-current={selected === board.kind ? 'page' : undefined}
            >
              {t(board.name)}
            </Link>
          ))}
        </div>
      </nav>
      <div className="upcoming-games">
        <span>{t('다음 게임을 기다리고 있나요?')}</span>
        <span>{t('더 많은 게임이 찾아올 예정이에요.')}</span>
      </div>
      <div className="sidebar-bottom">
        <div className="community-caption">
          <strong>
            {t('좋은 피드백이')}
            <br />
            {t('다음 플레이를 만듭니다.')}
          </strong>
        </div>
        <p>{t('경험을 나누고, 함께 성장해요.')}</p>
        <div className="sidebar-footer-links">
          <Link href={`${home}/terms`}>{t('이용약관')}</Link>
          <Link href={`${home}/privacy`}>{t('개인정보')}</Link>
          <Link href={`${home}/contact`}>{t('문의')}</Link>
        </div>
        <span className="copyright">© 2026 PLAYMATE</span>
      </div>
    </aside>
  );
}
