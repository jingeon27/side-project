'use client';
import { activeGameBoard, clashRoyaleBoards, gameBoardPath } from '@/features/board';
import { ClashRoyaleIcon } from '@/features/game-profile';
import { useI18n } from '@/shared/i18n';
import { TabLink } from '@/shared/navigation';

interface IGameBoardNavigationProps {
  locale: string;
  path: string;
}
export function GameBoardNavigation({ locale, path }: IGameBoardNavigationProps) {
  const { t } = useI18n();
  const selected = activeGameBoard(path);
  if (!selected) return null;
  return (
    <nav className="game-board-navigation" aria-label={t('클래시 로얄 게시판')}>
      <div className="game-board-title">
        <ClashRoyaleIcon size={28} />
        <strong>{t('클래시 로얄')}</strong>
      </div>
      <div className="board-tabs">
        {clashRoyaleBoards.map((board) => (
          <TabLink
            key={board.kind}
            href={gameBoardPath(locale, board.kind)}
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
