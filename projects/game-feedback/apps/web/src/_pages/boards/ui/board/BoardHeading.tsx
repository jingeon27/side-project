'use client';

import { useRouter } from 'next/navigation';

import { Plus } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import type { TBoardKind } from '@game-feedback/contracts';
import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import { parseBattleMode } from '@/features/battle';
import { parseCoachingRole } from '@/features/coaching';
import { useI18n } from '@/shared/i18n';

export function BoardHeading({
  locale,
  board,
  title,
  action = '글쓰기',
}: {
  locale: string;
  board: TBoardKind;
  title: string;
  action?: string;
}) {
  const { t } = useI18n();
  const { session, requireLogin } = useSession();
  const router = useRouter();
  const handleCompose = () => {
    if (!session.user) {
      requireLogin();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    router.push(
      appRoutes.compose(locale, board, params.get('game') ?? undefined, {
        battleMode: parseBattleMode(params.get('battleMode')),
        coachingRole: parseCoachingRole(params.get('coachingRole')),
      }),
    );
  };
  return (
    <div className="page-heading board-heading">
      <h1>{t(title)}</h1>
      <Button variant="accent" size="md" type="button" onClick={handleCompose}>
        <Plus size={16} />
        {t(action)}
      </Button>
    </div>
  );
}
