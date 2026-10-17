'use client';
import { useQuery } from '@tanstack/react-query';
import { activeGameBoard, gameBoards, gameBoardPath } from '@/features/board';
import { categoryOptions } from '@/features/category';
import { useI18n } from '@/shared/i18n';
import { useActiveItemScroll } from '@/shared/model/scroll';
import { TabLink } from '@/shared/navigation';
import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';
import { GameIcon } from './GameIcon';
interface IGameBoardNavigationProps {
  locale: string;
  path: string;
}
export function GameBoardNavigation({ locale, path }: IGameBoardNavigationProps) {
  const { t } = useI18n();
  const scrollTabs = useActiveItemScroll();
  const categories = useQuery(categoryOptions());
  const selected = activeGameBoard(path);
  const route = resolveAppRoute(path);
  const game = categories.data?.find((item) => item.active && item.slug === (route?.game ?? 'clash-royale'));
  if (!game || !route || !['feed', 'boards', 'post'].includes(route.screen)) return null;
  return (
    <nav className="game-board-navigation" aria-label={t('{game} 게시판', { game: game.name })}>
      <div className="game-board-title">
        <GameIcon slug={game.slug} />
        <strong>{game.name}</strong>
      </div>
      <div ref={scrollTabs} className="board-tabs">
        <TabLink href={appRoutes.feed(locale)} replace aria-current={!selected ? 'page' : undefined}>
          {t('전체 피드')}
        </TabLink>
        {gameBoards.map((board) => (
          <TabLink
            key={board.kind}
            href={gameBoardPath(locale, board.kind, game.slug)}
            replace
            aria-current={selected === board.kind ? 'page' : undefined}
          >
            {t(board.name)}
          </TabLink>
        ))}
      </div>
    </nav>
  );
}
