'use client';

import { Dialog } from '@side/design-system';
import { appRoutes } from '@game-feedback/bridge';
import type { TBoardKind } from '@game-feedback/contracts';
import { Check } from 'lucide-react';
import { gameBoards, gameBoardPath } from '@/features/board';
import type { Category } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { TabLink } from '@/shared/navigation';

interface IGameBoardSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete: (open: boolean) => void;
  onSelect: () => void;
  locale: string;
  game: Category;
  selected?: TBoardKind;
}

export function GameBoardSheet({
  open,
  onOpenChange,
  onOpenChangeComplete,
  onSelect,
  locale,
  game,
  selected,
}: IGameBoardSheetProps) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      title={t('분류 선택')}
      closeLabel={t('닫기')}
      className="game-board-sheet max-h-[calc(var(--visual-viewport-height,100dvh)-16px)] scroll-py-5 rounded-sheet p-5 pb-[max(20px,env(safe-area-inset-bottom))] transition-[opacity,translate] data-starting-style:translate-y-4 data-starting-style:scale-100 data-ending-style:translate-y-4 data-ending-style:scale-100"
    >
      <nav className="game-board-options" aria-label={t('{game} 게시판', { game: game.name })}>
        <TabLink
          href={appRoutes.feed(locale)}
          replace
          aria-current={!selected ? 'page' : undefined}
          onClick={onSelect}
        >
          <span>{t('전체 피드')}</span>
          {!selected && <Check size={20} aria-hidden="true" />}
        </TabLink>
        {gameBoards.map((board) => (
          <TabLink
            key={board.kind}
            href={gameBoardPath(locale, board.kind, game.slug)}
            replace
            aria-current={selected === board.kind ? 'page' : undefined}
            onClick={onSelect}
          >
            <span>{t(board.name)}</span>
            {selected === board.kind && <Check size={20} aria-hidden="true" />}
          </TabLink>
        ))}
      </nav>
    </Dialog>
  );
}
