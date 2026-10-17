'use client';
import { useQuery } from '@tanstack/react-query';
import { activeGameBoard, gameBoards } from '@/features/board';
import { categoryOptions } from '@/features/category';
import { useI18n } from '@/shared/i18n';
import { MotionButton, openOverlay } from '@/shared/ui';
import { resolveAppRoute } from '@game-feedback/bridge';
import { ChevronDown } from 'lucide-react';
import { GameIcon } from './GameIcon';
import { GameBoardSheet } from './GameBoardSheet';
interface IGameBoardNavigationProps {
  locale: string;
  path: string;
}
export function GameBoardNavigation({ locale, path }: IGameBoardNavigationProps) {
  const { t } = useI18n();
  const categories = useQuery(categoryOptions());
  const selected = activeGameBoard(path);
  const route = resolveAppRoute(path);
  const game = categories.data?.find((item) => item.active && item.slug === (route?.game ?? 'clash-royale'));
  if (!game || !route || !['feed', 'boards', 'post'].includes(route.screen)) return null;
  const current = t(gameBoards.find((board) => board.kind === selected)?.name ?? '전체 피드');
  function handleChooseCategory() {
    if (!game) return;
    openOverlay(({ isOpen, close, unmount }) => (
      <GameBoardSheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        onOpenChangeComplete={(open) => {
          if (!open) unmount();
        }}
        onSelect={close}
        locale={locale}
        game={game}
        selected={selected}
      />
    ));
  }
  return (
    <nav className="game-board-navigation" aria-label={t('{game} 게시판', { game: game.name })}>
      <div className="game-board-title">
        <GameIcon slug={game.slug} />
        <strong>{game.name}</strong>
      </div>
      <MotionButton
        type="button"
        variant="ghost"
        size="md"
        className="min-w-0 max-w-[60%] px-2"
        aria-label={t('분류 선택: {category}', { category: current })}
        aria-haspopup="dialog"
        onClick={handleChooseCategory}
      >
        <span className="truncate">{current}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </MotionButton>
    </nav>
  );
}
