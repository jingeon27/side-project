'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleHelp, Home, MessageCircle } from 'lucide-react';

import { resolveAppRoute } from '@game-feedback/bridge';
import type { TBoardKind } from '@game-feedback/contracts';

import { activeGameBoard, boardByKind, gameBoardPath } from '@/features/board';
import { categoryOptions } from '@/features/category';
import { useI18n } from '@/shared/i18n';
import { TabLink as Link } from '@/shared/navigation';

import { GameIcon } from './GameIcon';

interface ILeftSidebarProps {
  home: string;
  path: string;
  chatUnread: number;
}
export function LeftSidebar({ home, path, chatUnread }: ILeftSidebarProps) {
  const { t } = useI18n();
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
          {t('홈')}
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
              <SidebarBoardLink
                kind="FEEDBACK"
                locale={locale}
                game={game.slug}
                selected={gameSlug === game.slug ? selected : undefined}
              />
              <SidebarBoardLink
                kind="FRIEND_SALE"
                locale={locale}
                game={game.slug}
                selected={gameSlug === game.slug ? selected : undefined}
              />
              <SidebarBoardLink
                kind="FRIENDLY"
                locale={locale}
                game={game.slug}
                selected={gameSlug === game.slug ? selected : undefined}
              />
              <SidebarBoardLink
                kind="COACHING"
                locale={locale}
                game={game.slug}
                selected={gameSlug === game.slug ? selected : undefined}
              />
              <SidebarBoardLink
                kind="FREE"
                locale={locale}
                game={game.slug}
                selected={gameSlug === game.slug ? selected : undefined}
              />
            </div>
          </nav>
        ))}
      <div className="sidebar-bottom"></div>
    </aside>
  );
}

interface ISidebarBoardLinkProps {
  kind: TBoardKind;
  locale: string;
  game: string;
  selected?: TBoardKind;
}
function SidebarBoardLink({ kind, locale, game, selected }: ISidebarBoardLinkProps) {
  const { t } = useI18n();
  const board = boardByKind(kind);
  if (!board) return null;
  const active = selected === kind;
  return (
    <Link
      href={gameBoardPath(locale, kind, game)}
      replace
      className={`side-link ${active ? 'selected' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      {t(board.name)}
    </Link>
  );
}
