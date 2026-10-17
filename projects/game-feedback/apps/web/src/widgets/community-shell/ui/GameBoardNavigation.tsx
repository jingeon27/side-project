'use client';
import { useQuery } from '@tanstack/react-query';
import { buttonVariants, cn } from '@side/design-system';
import { activeGameBoard, gameBoards, gameBoardPath } from '@/features/board';
import { categoryOptions } from '@/features/category';
import { useI18n } from '@/shared/i18n';
import { TabLink } from '@/shared/navigation';
import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';
import { useCurrentChipScroll } from '../model/use-current-chip-scroll';
import { GameIcon } from './GameIcon';
interface IGameBoardNavigationProps {
  locale: string;
  path: string;
}
export function GameBoardNavigation({ locale, path }: IGameBoardNavigationProps) {
  const { t } = useI18n();
  const currentChip = useCurrentChipScroll();
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
      <div className="game-board-chips">
        <TabLink
          ref={!selected ? currentChip : undefined}
          href={appRoutes.feed(locale)}
          replace
          aria-current={!selected ? 'page' : undefined}
          className={cn(
            buttonVariants({ variant: !selected ? 'primary' : 'secondary', size: 'sm' }),
            'rounded-full',
          )}
        >
          {t('전체 피드')}
        </TabLink>
        {gameBoards.map((board) => (
          <TabLink
            key={board.kind}
            ref={selected === board.kind ? currentChip : undefined}
            href={gameBoardPath(locale, board.kind, game.slug)}
            replace
            aria-current={selected === board.kind ? 'page' : undefined}
            className={cn(
              buttonVariants({ variant: selected === board.kind ? 'primary' : 'secondary', size: 'sm' }),
              'rounded-full',
            )}
          >
            {t(board.name)}
          </TabLink>
        ))}
      </div>
    </nav>
  );
}
