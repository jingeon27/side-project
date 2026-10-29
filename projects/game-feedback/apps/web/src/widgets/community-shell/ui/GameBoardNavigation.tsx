'use client';

import type { Ref } from 'react';

import { useQuery } from '@tanstack/react-query';

import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';
import type { TBoardKind } from '@game-feedback/contracts';
import { buttonVariants, cn } from '@side/design-system';

import { activeGameBoard, boardByKind, gameBoardPath } from '@/features/board';
import { categoryOptions } from '@/features/category';
import { useI18n } from '@/shared/i18n';
import { TabLink } from '@/shared/navigation';

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
  if (!game || !route || !['feed', 'boards'].includes(route.screen)) return null;
  return (
    <div className="game-board-navigation">
      <nav className="game-category-group" aria-label={t('{game} 게시판', { game: game.name })}>
        <div className="game-board-title">
          <GameIcon slug={game.slug} />
          <strong>{game.name}</strong>
          <span>{t('분류')}</span>
        </div>
        <div className="game-board-chips">
          <TabLink
            ref={!selected ? currentChip : undefined}
            href={appRoutes.feed(locale)}
            replace
            aria-current={!selected ? 'page' : undefined}
            className={cn(
              buttonVariants({ variant: !selected ? 'accent' : 'secondary', size: 'sm' }),
              'rounded-full',
            )}
          >
            {t('전체')}
          </TabLink>
          <GameBoardChip
            kind="FEEDBACK"
            locale={locale}
            game={game.slug}
            selected={selected}
            currentChip={currentChip}
          />
          <GameBoardChip
            kind="FRIEND_SALE"
            locale={locale}
            game={game.slug}
            selected={selected}
            currentChip={currentChip}
          />
          <GameBoardChip
            kind="FRIENDLY"
            locale={locale}
            game={game.slug}
            selected={selected}
            currentChip={currentChip}
          />
          <GameBoardChip
            kind="COACHING"
            locale={locale}
            game={game.slug}
            selected={selected}
            currentChip={currentChip}
          />
          <GameBoardChip
            kind="FREE"
            locale={locale}
            game={game.slug}
            selected={selected}
            currentChip={currentChip}
          />
        </div>
      </nav>
    </div>
  );
}

interface IGameBoardChipProps {
  kind: TBoardKind;
  locale: string;
  game: string;
  selected?: TBoardKind;
  currentChip: Ref<HTMLAnchorElement>;
}
function GameBoardChip({ kind, locale, game, selected, currentChip }: IGameBoardChipProps) {
  const { t } = useI18n();
  const board = boardByKind(kind);
  if (!board) return null;
  const active = selected === kind;
  return (
    <TabLink
      ref={active ? currentChip : undefined}
      href={gameBoardPath(locale, kind, game)}
      replace
      aria-current={active ? 'page' : undefined}
      className={cn(buttonVariants({ variant: active ? 'accent' : 'secondary', size: 'sm' }), 'rounded-full')}
    >
      {t(board.name)}
    </TabLink>
  );
}
