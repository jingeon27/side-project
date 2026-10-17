'use client';
import { useI18n } from '@/shared/i18n';
import { TabLink as Link } from '@/shared/navigation';
import { CircleHelp, MessageCircle, Home } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { categoryOptions } from '@/features/category';
import { GameIcon } from './GameIcon';
import { activeGameBoard, gameBoards, gameBoardPath } from '@/features/board';
import { resolveAppRoute } from '@game-feedback/bridge';
import { useSession } from '@/features/auth';
interface ILeftSidebarProps {
  home: string;
  path: string;
  chatUnread: number;
}
export function LeftSidebar({ home, path, chatUnread }: ILeftSidebarProps) {
  const { t } = useI18n();
  const { session } = useSession();
  const tab = resolveAppRoute(path)?.tab;
  const selected = activeGameBoard(path);
  const categories = useQuery(categoryOptions());
  const gameSlug = resolveAppRoute(path)?.game;
  const locale = home.slice(1);
  return (
    <aside className="left-sidebar">
      <div className="sidebar-label">{t('둘러보기')}</div>
      <nav aria-label={t('주 메뉴')}>
        <Link
          className={`side-link ${tab === 'feed' ? 'selected' : ''}`}
          href={home}
          replace
          aria-current={tab === 'feed' ? 'page' : undefined}
        >
          <Home size={19} />
          {t('피드')}
        </Link>
        <Link
          className={`side-link ${tab === 'guide' ? 'selected' : ''}`}
          href={`${home}/guide`}
          replace
          aria-current={tab === 'guide' ? 'page' : undefined}
        >
          <CircleHelp size={19} />
          {t('가이드')}
        </Link>
        <Link
          className={`side-link ${tab === 'messages' ? 'selected' : ''}`}
          href={`${home}/messages`}
          replace
          aria-current={tab === 'messages' ? 'page' : undefined}
          aria-label={chatUnread > 0 ? t('채팅 {count}개', { count: chatUnread }) : t('채팅')}
        >
          <MessageCircle size={19} />
          {t('채팅')}
          {chatUnread > 0 && (
            <span className="count-badge" aria-hidden="true">
              {chatUnread > 99 ? '99+' : chatUnread}
            </span>
          )}
        </Link>
      </nav>
      <div className="sidebar-separator" />
      <div className="sidebar-label">{t('나의 게임')}</div>
      {categories.data
        ?.filter((game) => game.active)
        .map((game) => (
          <nav key={game.id} aria-label={t('{game} 게시판', { game: game.name })}>
            <Link className="game-side-link" href={gameBoardPath(locale, 'FEEDBACK', game.slug)}>
              <GameIcon slug={game.slug} size={40} />
              <strong>{game.name}</strong>
            </Link>
            <div className="game-submenu">
              {gameBoards.map((board) => (
                <Link
                  key={board.kind}
                  href={gameBoardPath(locale, board.kind, game.slug)}
                  replace
                  className={`side-link ${selected === board.kind && gameSlug === game.slug ? 'selected' : ''}`}
                  aria-current={selected === board.kind && gameSlug === game.slug ? 'page' : undefined}
                >
                  {t(board.name)}
                </Link>
              ))}
            </div>
          </nav>
        ))}
      <div className="sidebar-bottom">
        <div className="sidebar-footer-links">
          <Link href={`${home}/terms`}>{t('이용약관')}</Link>
          <Link href={`${home}/privacy`}>{t('개인정보')}</Link>
          <Link href={`${home}/contact`}>{t('문의')}</Link>
        </div>
        <span className="copyright">© 2026 PLAYMATE</span>
        {session?.demoMode && <p className="demo-badge">{t('예시 데이터를 사용하는 데모 환경')}</p>}
      </div>
    </aside>
  );
}
