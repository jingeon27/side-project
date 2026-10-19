'use client';

import { appRoutes } from '@game-feedback/bridge';
import type { TCoachingRole } from '@game-feedback/contracts';
import { parseCoachingRole } from '@/features/coaching';
import { useI18n } from '@/shared/i18n';
import { useBrowserSearch } from '@/shared/navigation';
import { BoardFilterLink } from './BoardFilterLink';

export function CoachingFilters({ locale, slug }: { locale: string; slug: string }) {
  const { t } = useI18n();
  const params = new URLSearchParams(useBrowserSearch('', `/${locale}/boards/${slug}`));
  const role = parseCoachingRole(params.get('coachingRole'));
  const hrefFor = (value?: TCoachingRole) =>
    appRoutes.boards(locale, slug, params.get('q') ?? undefined, params.get('game') ?? undefined, {
      coachingRole: value,
    });
  return (
    <nav className="coaching-filters" aria-label={t('모집 유형')}>
      <BoardFilterLink href={hrefFor()} active={role === undefined}>
        {t('전체')}
      </BoardFilterLink>
      <BoardFilterLink href={hrefFor('COACH')} active={role === 'COACH'}>
        {t('수강생 모집')}
      </BoardFilterLink>
      <BoardFilterLink href={hrefFor('STUDENT')} active={role === 'STUDENT'}>
        {t('코치 구함')}
      </BoardFilterLink>
    </nav>
  );
}
