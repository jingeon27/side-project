'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { appRoutes } from '@game-feedback/bridge';
import type { TBoardKind } from '@game-feedback/contracts';

import { useSession } from '@/features/auth';
import { parseBattleMode } from '@/features/battle';
import { parseCoachingRole } from '@/features/coaching';
import { parseSearch } from '@/shared/lib/query-string';
import { useBrowserSearch } from '@/shared/navigation';
import { FloatingComposeButton } from '@/widgets/compose-entry';

export function BoardComposeEntry({ locale, board }: { locale: string; board: TBoardKind }) {
  const { session, requireLogin } = useSession();
  const router = useRouter();
  const userId = session.user?.id;
  const search = useBrowserSearch();
  const composeHref = useCallback(
    (query: string) => {
      const params = parseSearch(query);
      return appRoutes.compose(locale, board, params.game, {
        battleMode: parseBattleMode(params.battleMode),
        coachingRole: parseCoachingRole(params.coachingRole),
      });
    },
    [board, locale],
  );
  useEffect(() => {
    if (!userId) return;
    router.prefetch(composeHref(search || window.location.search));
  }, [composeHref, router, search, userId]);
  const handleCompose = () => {
    if (!session.user) {
      requireLogin();
      return;
    }
    router.push(composeHref(window.location.search));
  };
  return <FloatingComposeButton onCompose={handleCompose} />;
}
